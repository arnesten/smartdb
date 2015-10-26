var nano = require('nano');
var request = require('request');
var url = require('url');
var cacheProviders = require('smartdb-stdcacheproviders');
var inMemoryCacheProvider = cacheProviders.inMemoryCacheProvider;
var fake = require('./fake.js');
var agentkeepalive = require('agentkeepalive');

module.exports = smartdb;
smartdb.fake = fake;
smartdb.cacheProviders = cacheProviders;

function smartdb(options) {
    var typeProperty = options.typeProperty || 'type';

    var docToEntity = options.mapDocToEntity || function (doc) {
            return doc;
        };
    var entityToDoc = options.mapEntityToDoc || function (entity) {
            return JSON.parse(JSON.stringify(entity));
        };
    var rewriteView = options.rewriteView || function (type, viewName) {
            return [type, viewName];
        };
    var validate = options.validate || function (entity, callback) {
            callback();
        };
    var cacheProvider = options.cacheProvider || inMemoryCacheProvider;

    var requestDefaults = options.requestDefaults || {};
    if (!requestDefaults.agent) {
        requestDefaults.agent = new agentkeepalive({
            maxSockets: 256,
            maxFreeSockets: 256,
            keepAliveTimeout: 60 * 1000
        });
    }

    var entityInfoMap = {};

    options.databases.forEach(function (databaseInfo) {
        var databaseUrl = databaseInfo.url;
        var urlObj = url.parse(databaseUrl);
        delete urlObj.auth;
        var safeDatabaseUrl = url.format(urlObj);
        var nanoOptions = {
            url: databaseUrl,
            request_defaults: requestDefaults
        };
        var nanoDb = nano(nanoOptions);
        Object.keys(databaseInfo.entities).forEach(function (entityType) {
            var entitySettings = databaseInfo.entities[entityType];
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
        view: view,
        viewValue: viewValue,
        viewRaw: viewRaw,
        list: list,
        get: get,
        getOrNull: getOrNull,
        save: save,
        update: update,
        merge: merge,
        remove: remove
    };

    function view(type, viewName, args, callback) {
        if (!isFunction(callback)) throw Error('callback required');
        if (typeof type !== 'string') return callback(Error('type required'));
        if (typeof viewName !== 'string') return callback(Error('viewName required'));
        if (!args) return callback(Error('args required'));

        var entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(Error('Type not defined "' + type + '"'));

        var viewArgs = Object.assign({include_docs: true}, args);
        var path = rewriteView(type, viewName);
        entityInfo.nanoDb.view(path[0], path[1], viewArgs, function (err, body) {
            if (err) return callback(fixViewError(entityInfo, path, err));
            if (!body) return callback(bodyMissingError(path));
            if (!body.rows) return callback(rowsMissingError(path));

            var entities = body.rows
                .filter(function (row) {
                    return row.doc;
                })
                .map(function (row) {
                    return docToEntity(row.doc)
                });
            callback(null, entities);
        });
    }

    function viewValue(type, viewName, args, callback) {
        if (!isFunction(callback)) throw Error('callback required');
        if (typeof type !== 'string') return callback(Error('type required'));
        if (typeof viewName !== 'string') return callback(Error('viewName required'));
        if (!args) return callback(Error('args required'));

        var entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(Error('Type not defined "' + type + '"'));

        var path = rewriteView(type, viewName);
        entityInfo.nanoDb.view(path[0], path[1], args, function (err, body) {
            if (err) return callback(fixViewError(entityInfo, path, err));
            if (!body) return callback(bodyMissingError(path));
            if (!body.rows) return callback(rowsMissingError(path));

            var values = body.rows
                .map(function (row) {
                    return row.value
                });
            callback(null, values);
        });
    }

    function viewRaw(type, viewName, args, callback) {
        if (!isFunction(callback)) throw Error('callback required');
        if (typeof type !== 'string') return callback(Error('type required'));
        if (typeof viewName !== 'string') return callback(Error('viewName required'));
        if (!args) return callback(Error('args required'));

        var entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(Error('Type not defined "' + type + '"'));

        var path = rewriteView(type, viewName);
        entityInfo.nanoDb.view(path[0], path[1], args, function (err, body) {
            if (err) return callback(fixViewError(entityInfo, path, err));
            if (!body) return callback(bodyMissingError(path));
            if (!body.rows) return callback(rowsMissingError(path));

            callback(null, body.rows);
        });
    }

    function list(type, listName, viewName, args, callback) {
        if (!isFunction(callback)) throw Error('callback required');
        if (typeof type !== 'string') return callback(Error('type required'));
        if (typeof listName !== 'string') return callback(Error('listName required'));
        if (typeof viewName !== 'string') return callback(Error('viewName required'));
        if (!args) return callback(Error('args required'));

        var entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(Error('Type not defined "' + type + '"'));

        var path = rewriteView(type, viewName);

        var qs = {};
        var specialKeys = ['startkey', 'endkey', 'key', 'keys'];
        var argsKeys = Object.keys(args);
        argsKeys.forEach(function (key) {
            var value = args[key];
            if (specialKeys.indexOf(key) >= 0) {
                qs[key] = JSON.stringify(value);
            }
            else {
                qs[key] = value;
            }
        });

        var req = requestDefaults ? request.defaults(requestDefaults) : request;

        req({
            uri: entityInfo.databaseUrl + '/_design/' + path[0] + '/_list/' + listName + '/' + path[1] +
            (argsKeys.length ? '?' + require('querystring').stringify(qs) : '')
        }, function (err, res, body) {
            if (err) return callback(err);
            if (res.statusCode !== 200) return callback(Error('Status code != 200. Was ' + res.statusCode));

            callback(null, body);
        });
    }

    function get(type, id, callback) {
        if (!isFunction(callback)) throw Error('callback required');
        if (typeof type !== 'string') return callback(Error('type required'));
        if (typeof id !== 'string') return callback(Error('id required'));

        getOrNull(type, id, function (err, entity) {
            if (err) return callback(err);
            if (entity === null) {
                return callback(Error('Entity is missing. Type=' + type + '. ID=' + id));
            }

            callback(null, entity);
        });
    }

    function getOrNull(type, id, callback) {
        if (!isFunction(callback)) throw Error('callback required');
        if (!id) return callback(null, null);
        if (typeof type !== 'string') return callback(Error('type required'));

        var entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(Error('Type not defined "' + type + '"'));

        var cache = entityInfo.cache;

        cache.get(id, function (err, cachedDoc) {
            if (err) return callback(err);

            if (cachedDoc) {
                var entity = docToEntity(cachedDoc);
                return callback(null, entity);
            }

            entityInfo.nanoDb.get(id, function (err, doc) {
                if (err) {
                    if (err.status_code === 404) {
                        return callback(null, null);
                    }

                    return callback(fixNanoError(entityInfo, err));
                }

                cache.set(id, doc, function (err) {
                    if (err) return callback(null, err);

                    var entity = docToEntity(doc);

                    callback(null, entity);
                });
            });
        });
    }

    function save(entity, callback) {
        if (!isFunction(callback)) throw Error('callback required');
        if (!entity) return callback(Error('entity required'));

        var type = entity[typeProperty];
        var entityInfo = entityInfoMap[type];

        var doc = entityToDoc(entity);
        var docId = doc._id;
        delete doc._id;

        if (!entityInfo) return callback(Error('Type not defined "' + type + '"'));
        if (doc._rev) return callback(Error('_rev should not be defined when saving'));

        validate(entity, function (err) {
            if (err) return callback(err);

            hook({
                type: 'preInsert',
                doc: doc,
                operation: 'save',
                saveArgs: {
                    entity: entity
                }
            }, entityInfo, function (err) {
                if (err) return callback(err);

                var handler = function (err, response) {
                    if (err) return callback(fixNanoError(entityInfo, err));

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
        if (!isFunction(callback)) throw Error('callback required');
        if (!entity) return callback(Error('entity required'));

        var type = entity[typeProperty];
        var entityInfo = entityInfoMap[type];
        var doc = entityToDoc(entity);
        if (!entityInfo) return callback(Error('Type not defined "' + type + '"'));
        if (!doc._id) return callback(Error('_id is required'));
        if (!doc._rev) return callback(Error('_rev is required'));

        validate(entity, function (err) {
            if (err) return callback(err);

            hook({
                type: 'preInsert',
                doc: doc,
                operation: 'update',
                updateArgs: {
                    entity: entity
                }
            }, entityInfo, function (err) {
                if (err) return callback(err);

                var docId = doc._id;
                delete doc._id;
                entityInfo.cache.del(docId, function (err) {
                    if (err) return callback(err);

                    entityInfo.nanoDb.insert(doc, docId, function (err, response) {
                        if (err) return callback(fixNanoError(entityInfo, err));

                        entity._rev = response.rev;
                        callback();
                    });
                });
            });
        });
    }

    function merge(type, id, changedProperties, callback) {
        if (!isFunction(callback)) throw Error('callback required');
        if (typeof type !== 'string') return callback(Error('type required'));
        if (typeof id !== 'string') return callback(Error('id required'));
        if (!changedProperties) return callback(Error('changedProperties required'));

        var entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(Error('Type not defined "' + type + '"'));

        get(type, id, function (err, entity) {
            if (err) return callback(err);

            Object.assign(entity, changedProperties);

            var doc = entityToDoc(entity);
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
                }, entityInfo, function () {
                    if (err) return callback(err);

                    entityInfo.cache.del(id, function (err) {
                        if (err) return callback(err);

                        entityInfo.nanoDb.insert(doc, id, function (err, res) {
                            if (err) return callback(fixNanoError(entityInfo, err));

                            callback(null, {rev: res.rev});
                        });
                    });
                })
            });
        });
    }

    function remove(type, id, callback) {
        if (!isFunction(callback)) throw Error('callback required');
        if (typeof type !== 'string') return callback(Error('type required'));
        if (typeof id !== 'string') return callback(Error('id required'));

        var entityInfo = entityInfoMap[type];
        if (!entityInfo) return callback(Error('Type not defined "' + type + '"'));

        get(type, id, function (err, entity) {
            if (err) return callback(err);

            entityInfo.cache.del(id, function (err) {
                if (err) return callback(err);

                entityInfo.nanoDb.destroy(id, entity._rev, function (err, result) {
                    if (err) return callback(fixNanoError(entityInfo, err));

                    callback(null, result);
                });
            });
        });
    }

    function fixNanoError(entityInfo, err) {
        var unsafe = entityInfo.databaseUrl;
        var safe = entityInfo.safeDatabaseUrl;
        if (err.request && err.request.uri) {
            err.request.uri = err.request.uri.replace(unsafe, safe);
        }
        if (err.headers && err.headers.uri) {
            err.headers.uri = err.headers.uri.replace(unsafe, safe);
        }
        return err;
    }

    function fixViewError(entityInfo, path, err) {
        if (err.status_code === 404) {
            return Error('View not found: _design/' + path[0] + '/_view/' + path[1]);
        }
        return fixNanoError(entityInfo, err);
    }

    function bodyMissingError(path) {
        // Had this problem in production while having network issues. Cause "Uncaught exception" to happen.
        return Error('View returned an undefined body: _design/' + path[0] + '/_view/' + path[1]);
    }

    function rowsMissingError(path) {
        // Had this problem in production while having network issues. Cause "Uncaught exception" to happen.
        return Error('View returned an body without rows: _design/' + path[0] + '/_view/' + path[1]);
    }

    function hook(event, entityInfo, callback) {
        var hookMethod = entityInfo.eventHooks[event.type];
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
}