'use strict';
let nano = require('nano');
let request = require('request');
let url = require('url');
let cacheProviders = require('smartdb-stdcacheproviders');
let inMemoryCacheProvider = cacheProviders.inMemoryCacheProvider;
let fake = require('./fake.js');
let agentkeepalive = require('agentkeepalive');
let querystring = require('querystring');

module.exports = smartdb;
smartdb.fake = fake;
smartdb.cacheProviders = cacheProviders;

function smartdb(options) {
    let typeProperty = options.typeProperty || 'type';

    let docToEntity = options.mapDocToEntity || (doc => doc);
    let entityToDoc = options.mapEntityToDoc || (entity => JSON.parse(JSON.stringify(entity)));
    let rewriteView = options.rewriteView || ((type, viewName) => [type, viewName]);
    let validate = options.validate || ((entity, callback) => { callback(); });
    let cacheProvider = options.cacheProvider || inMemoryCacheProvider;

    let requestDefaults = options.requestDefaults || {};
    if (!requestDefaults.agent) {
        requestDefaults.agent = new agentkeepalive({
            maxSockets: 256,
            maxFreeSockets: 256,
            keepAliveTimeout: 60 * 1000
        });
    }

    let entityInfoMap = {};

    options.databases.forEach(databaseInfo => {
        let databaseUrl = databaseInfo.url;
        let urlObj = url.parse(databaseUrl);
        delete urlObj.auth;
        let safeDatabaseUrl = url.format(urlObj);
        let nanoOptions = {
            url: databaseUrl,
            requestDefaults: requestDefaults
        };
        let nanoDb = nano(nanoOptions);
        Object.keys(databaseInfo.entities).forEach(entityType => {
            let entitySettings = databaseInfo.entities[entityType];
            entityInfoMap[entityType] = {
                databaseUrl: databaseUrl,
                safeDatabaseUrl: safeDatabaseUrl,
                nanoDb: nanoDb,
                cache: cacheProvider.create(entityType, entitySettings),
                eventHooks: databaseInfo.eventHooks || {}
            };
        });
    });

    return {
        view: promisify(view),
        viewValue: promisify(viewValue),
        viewRaw: promisify(viewRaw),
        list: promisify(list),
        get: promisify(get),
        getOrNull: promisify(getOrNull),
        save: promisify(save),
        update: promisify(update),
        merge: promisify(merge),
        remove: promisify(remove)
    };

    function view(type, viewName, args, callback) {
        if (!isFunction(callback)) throw new Error('callback required');
        if (typeof type !== 'string') return callback(new Error('type required'));
        if (typeof viewName !== 'string') return callback(new Error('viewName required'));
        if (!args) return callback(new Error('args required'));

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(new Error('Type not defined "' + type + '"'));

        let viewArgs = Object.assign({ include_docs: true }, args);
        let path = rewriteView(type, viewName);
        entityInfo.nanoDb.view(path[0], path[1], viewArgs, (err, body) => {
            if (err) return callback(fixViewError(entityInfo, path, err));
            if (!body) return callback(bodyMissingError(path));
            if (!body.rows) return callback(rowsMissingError(path));

            let entities = body.rows
                .filter(row => row.doc)
                .map(row => docToEntity(row.doc));
            callback(null, entities);
        });
    }

    function viewValue(type, viewName, args, callback) {
        if (!isFunction(callback)) throw new Error('callback required');
        if (typeof type !== 'string') return callback(new Error('type required'));
        if (typeof viewName !== 'string') return callback(new Error('viewName required'));
        if (!args) return callback(new Error('args required'));

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(new Error('Type not defined "' + type + '"'));

        let path = rewriteView(type, viewName);
        entityInfo.nanoDb.view(path[0], path[1], args, (err, body) => {
            if (err) return callback(fixViewError(entityInfo, path, err));
            if (!body) return callback(bodyMissingError(path));
            if (!body.rows) return callback(rowsMissingError(path));

            let values = body.rows.map(row => row.value);
            callback(null, values);
        });
    }

    function viewRaw(type, viewName, args, callback) {
        if (!isFunction(callback)) throw new Error('callback required');
        if (typeof type !== 'string') return callback(new Error('type required'));
        if (typeof viewName !== 'string') return callback(new Error('viewName required'));
        if (!args) return callback(new Error('args required'));

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(new Error('Type not defined "' + type + '"'));

        let path = rewriteView(type, viewName);
        entityInfo.nanoDb.view(path[0], path[1], args, (err, body) => {
            if (err) return callback(fixViewError(entityInfo, path, err));
            if (!body) return callback(bodyMissingError(path));
            if (!body.rows) return callback(rowsMissingError(path));

            callback(null, body.rows);
        });
    }

    function list(type, listName, viewName, args, callback) {
        if (!isFunction(callback)) throw new Error('callback required');
        if (typeof type !== 'string') return callback(new Error('type required'));
        if (typeof listName !== 'string') return callback(new Error('listName required'));
        if (typeof viewName !== 'string') return callback(new Error('viewName required'));
        if (!args) return callback(new Error('args required'));

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(new Error('Type not defined "' + type + '"'));

        let path = rewriteView(type, viewName);

        let qs = {};
        let specialKeys = ['startkey', 'endkey', 'key', 'keys'];
        let argsKeys = Object.keys(args);
        argsKeys.forEach(key => {
            let value = args[key];
            if (specialKeys.indexOf(key) >= 0) {
                qs[key] = JSON.stringify(value);
            }
            else {
                qs[key] = value;
            }
        });

        let req = requestDefaults ? request.defaults(requestDefaults) : request;

        req({
            uri: entityInfo.databaseUrl + '/_design/' + path[0] + '/_list/' + listName + '/' + path[1] +
            (argsKeys.length ? '?' + querystring.stringify(qs) : '')
        }, (err, res, body) => {
            if (err) return callback(err);
            if (res.statusCode !== 200) return callback(new Error('Status code != 200. Was ' + res.statusCode));

            callback(null, body);
        });
    }

    function get(type, id, callback) {
        if (!isFunction(callback)) throw new Error('callback required');
        if (typeof type !== 'string') return callback(new Error('type required'));
        if (!id || typeof id !== 'string') return callback(new Error('id required'));

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(new Error('Type not defined "' + type + '"'));

        let cache = entityInfo.cache;

        cache.get(id, (err, cachedDoc) => {
            if (err) return callback(err);

            if (cachedDoc) {
                let entity = docToEntity(cachedDoc);
                return callback(null, entity);
            }

            entityInfo.nanoDb.get(id, (err, doc) => {
                if (err) {
                    fixNanoError(entityInfo, err);
                    if (err.statusCode === 404) {
                        return callback(entityMissingError(err, {
                            entityId: id,
                            entityType: type
                        }));
                    }

                    return callback(err);
                }

                cache.set(id, doc, err => {
                    if (err) return callback(err);

                    let entity = docToEntity(doc);

                    callback(null, entity);
                });
            });
        });
    }

    function getOrNull(type, id, callback) {
        if (!isFunction(callback)) throw new Error('callback required');
        if (!id) return callback(null, null);
        if (typeof type !== 'string') return callback(new Error('type required'));

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(new Error('Type not defined "' + type + '"'));

        let cache = entityInfo.cache;

        cache.get(id, (err, cachedDoc) => {
            if (err) return callback(err);

            if (cachedDoc) {
                let entity = docToEntity(cachedDoc);
                return callback(null, entity);
            }

            entityInfo.nanoDb.get(id, (err, doc) => {
                if (err) {
                    if (err.statusCode === 404) {
                        return callback(null, null);
                    }

                    return callback(fixNanoError(entityInfo, err));
                }

                cache.set(id, doc, err => {
                    if (err) return callback(err);

                    let entity = docToEntity(doc);

                    callback(null, entity);
                });
            });
        });
    }

    function save(entity, callback) {
        if (!isFunction(callback)) throw new Error('callback required');
        if (!entity) return callback(new Error('entity required'));

        let type = entity[typeProperty];
        let entityInfo = entityInfoMap[type];

        let doc = entityToDoc(entity);
        let docId = doc._id;
        delete doc._id;

        if (!entityInfo) return callback(new Error('Type not defined "' + type + '"'));
        if (doc._rev) return callback(new Error('_rev should not be defined when saving'));

        validate(entity, err => {
            if (err) return callback(err);

            hook({
                type: 'preInsert',
                doc: doc,
                operation: 'save',
                saveArgs: {
                    entity: entity
                }
            }, entityInfo, err => {
                if (err) return callback(err);

                let handler = (err, response) => {
                    if (err) {
                        fixNanoError(entityInfo, err);
                        if (err.statusCode === 409) {
                            return callback(entityConflictError(err, {
                                entityId: docId,
                                entityType: type
                            }));
                        }
                        return callback(err);
                    }

                    entity._id = response.id;
                    entity._rev = response.rev;
                    callback();
                };

                if (docId) {
                    entityInfo.nanoDb.insert(doc, docId, handler);
                }
                else {
                    entityInfo.nanoDb.insert(doc, handler);
                }
            })
        });
    }

    function update(entity, callback) {
        if (!isFunction(callback)) throw new Error('callback required');
        if (!entity) return callback(new Error('entity required'));

        let type = entity[typeProperty];
        let entityInfo = entityInfoMap[type];
        let doc = entityToDoc(entity);
        if (!entityInfo) return callback(new Error('Type not defined "' + type + '"'));
        if (!doc._id) return callback(new Error('_id is required'));
        if (!doc._rev) return callback(new Error('_rev is required'));

        validate(entity, err => {
            if (err) return callback(err);

            hook({
                type: 'preInsert',
                doc: doc,
                operation: 'update',
                updateArgs: {
                    entity: entity
                }
            }, entityInfo, err => {
                if (err) return callback(err);

                let docId = doc._id;
                delete doc._id;
                entityInfo.cache.del(docId, err => {
                    if (err) return callback(err);

                    entityInfo.nanoDb.insert(doc, docId, (err, response) => {
                        if (err) {
                            fixNanoError(entityInfo, err);
                            if (err.statusCode === 409) {
                                return callback(entityConflictError(err, {
                                    entityId: docId,
                                    entityType: type
                                }));
                            }
                            return callback(err);
                        }

                        entity._rev = response.rev;
                        callback();
                    });
                });
            });
        });
    }

    function merge(type, id, changedProperties, callback) {
        if (!isFunction(callback)) throw new Error('callback required');
        if (typeof type !== 'string') return callback(new Error('type required'));
        if (typeof id !== 'string') return callback(new Error('id required'));
        if (!changedProperties) return callback(new Error('changedProperties required'));

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(new Error('Type not defined "' + type + '"'));

        get(type, id, function (err, entity) {
            if (err) return callback(err);

            Object.assign(entity, changedProperties);

            let doc = entityToDoc(entity);
            delete doc._id;

            validate(entity, function (err) {
                if (err) return callback(err);

                hook({
                    type: 'preInsert',
                    doc: doc,
                    operation: 'merge',
                    mergeArgs: {
                        type: type,
                        id: id,
                        changedProperties: changedProperties
                    }
                }, entityInfo, err => {
                    if (err) return callback(err);

                    entityInfo.cache.del(id, err => {
                        if (err) return callback(err);

                        entityInfo.nanoDb.insert(doc, id, (err, res) => {
                            if (err) {
                                fixNanoError(entityInfo, err);
                                if (err.statusCode === 409) {
                                    return callback(entityConflictError(err, {
                                        entityId: id,
                                        entityType: type
                                    }));
                                }
                                return callback(err);
                            }

                            callback(null, { rev: res.rev });
                        });
                    });
                })
            });
        });
    }

    function remove(type, id, callback) {
        if (!isFunction(callback)) throw new Error('callback required');
        if (typeof type !== 'string') return callback(new Error('type required'));
        if (typeof id !== 'string') return callback(new Error('id required'));

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(new Error('Type not defined "' + type + '"'));

        get(type, id, (err, entity) => {
            if (err) return callback(err);

            entityInfo.cache.del(id, (err) => {
                if (err) return callback(err);

                entityInfo.nanoDb.destroy(id, entity._rev, (err, result) => {
                    if (err) {
                        fixNanoError(entityInfo, err);
                        if (err.statusCode === 409) {
                            return callback(entityConflictError(err, {
                                entityId: id,
                                entityType: type
                            }));
                        }
                        return callback(err);
                    }

                    callback(null, result);
                });
            });
        });
    }

    function fixNanoError(entityInfo, err) {
        let unsafe = entityInfo.databaseUrl;
        let safe = entityInfo.safeDatabaseUrl;
        if (err.request && err.request.uri) {
            err.request.uri = err.request.uri.replace(unsafe, safe);
        }
        if (err.headers && err.headers.uri) {
            err.headers.uri = err.headers.uri.replace(unsafe, safe);
        }
        return err;
    }

    function fixViewError(entityInfo, path, err) {
        if (err.statusCode === 404) {
            return new Error('View not found: _design/' + path[0] + '/_view/' + path[1]);
        }
        return fixNanoError(entityInfo, err);
    }

    function bodyMissingError(path) {
        // Had this problem in production while having network issues. Cause "Uncaught exception" to happen.
        return new Error('View returned an undefined body: _design/' + path[0] + '/_view/' + path[1]);
    }

    function rowsMissingError(path) {
        // Had this problem in production while having network issues. Cause "Uncaught exception" to happen.
        return new Error('View returned an body without rows: _design/' + path[0] + '/_view/' + path[1]);
    }

    function hook(event, entityInfo, callback) {
        let hookMethod = entityInfo.eventHooks[event.type];
        if (hookMethod) {
            hookMethod(event, callback);
        }
        else {
            callback();
        }
    }

    function isFunction(fn) {
        return typeof fn === 'function';
    }

    function entityConflictError(err, options) {
        return createError(Object.assign({
            name: 'EntityConflictError',
            message: 'Conflict when trying to persist entity change',
            scope: 'smartdb',
            request: err.request,
            response: {
                statusCode: err.statusCode,
                headers: err.headers
            }
        }, options));
    }

    function entityMissingError(err, options) {
        return createError(Object.assign({
            name: 'EntityMissingError',
            message: 'Entity is missing',
            scope: 'smartdb',
            request: err.request,
            response: {
                statusCode: err.statusCode,
                headers: err.headers
            }
        }, options));
    }

    function createError(extend) {
        let error = new Error();
        Object.assign(error, extend);
        return error;
    }

    function promisify(fn) {
        return (...args) => {
            let last = args[args.length - 1];
            let hasCallback = typeof last === 'function';
            if (hasCallback) {
                fn(...args);
            }
            else {
                return new Promise((resolve, reject) => {
                    fn(...args, (err, result) => {
                        if (err) return reject(err);
                        resolve(result);
                    });
                });
            }
        };
    }
}