var nano = require('nano');
var _ = require('underscore');
var lru = require('lru-cache');
var request = require('request');
var url = require('url');

var nullCache = {
    get: function () {
    },
    set: function () {
    },
    del: function () {
    },
    reset: function () {
    },
    isNullCache: true
};

module.exports = function (options) {

    var getEntityCreator = options.getEntityCreator || function () {
        return function (doc) {
            return doc;
        };
    };
    var toDoc = options.mapEntityToDoc || function (entity) {
        return JSON.parse(JSON.stringify(entity));
    };
    var rewriteView = options.rewriteView || function (type, viewName) {
        return [type, viewName];
    };
    var validate = options.validate || function (entity, callback) {
        callback();
    };

    var entityInfoMap = {};

    options.databases.forEach(function (databaseInfo) {
        var databaseUrl = databaseInfo.url;
        var urlObj = url.parse(databaseUrl);
        delete urlObj.auth;
        var safeDatabaseUrl = url.format(urlObj);

        var nanoDb = nano({
            url: databaseUrl,
            request_defaults: {
                pool: {
                    maxSockets: 100
                }
            }
        });
        Object.keys(databaseInfo.entities).forEach(function (entityType) {
            var entitySettings = databaseInfo.entities[entityType];
            entityInfoMap[entityType] = {
                databaseUrl: databaseUrl,
                safeDatabaseUrl: safeDatabaseUrl,
                nanoDb: nanoDb,
                creator: getEntityCreator(entityType),
                cache: createCache(entitySettings),
                eventHooks: databaseInfo.eventHooks || {}
            };
        });
    });

    function createCache(entitySettings) {
        var maxSize = entitySettings.cacheMaxSize;
        var maxAge = entitySettings.cacheMaxAge;
        if (maxSize || maxAge) {
            return lru({
                max: maxSize || 10000,
                maxAge: maxAge
            });
        }

        return nullCache;
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
            return new Error('View not found: _design/' + path[0] + '/_view/' + path[1]);
        }
        return fixNanoError(entityInfo, err);
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

    return {
        view: function (type, viewName, args, callback) {
            if (!_.isFunction(callback)) throw new Error('callback required');
            if (typeof type !== 'string') return callback(new Error('type required'));
            if (typeof viewName !== 'string') return callback(new Error('viewName required'));
            if (!args) return callback(new Error('args required'));

            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            var viewArgs = _.extend({ include_docs: true }, args);
            var path = rewriteView(type, viewName);
            entityInfo.nanoDb.view(path[0], path[1], viewArgs, function (err, body) {
                if (err) return callback(fixViewError(entityInfo, path, err));

                var entities = body.rows
                    .map(function (row) {
                        return entityInfo.creator(row.doc)
                    });
                callback(null, entities);
            });
        },

        viewValue: function (type, viewName, args, callback) {
            if (!_.isFunction(callback)) throw new Error('callback required');
            if (typeof type !== 'string') return callback(new Error('type required'));
            if (typeof viewName !== 'string') return callback(new Error('viewName required'));
            if (!args) return callback(new Error('args required'));

            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            var path = rewriteView(type, viewName);
            entityInfo.nanoDb.view(path[0], path[1], args, function (err, body) {
                if (err) return callback(fixViewError(entityInfo, path, err));

                var values = body.rows
                    .map(function (row) {
                        return row.value
                    });
                callback(null, values);
            });
        },

        viewRaw: function (type, viewName, args, callback) {
            if (!_.isFunction(callback)) throw new Error('callback required');
            if (typeof type !== 'string') return callback(new Error('type required'));
            if (typeof viewName !== 'string') return callback(new Error('viewName required'));
            if (!args) return callback(new Error('args required'));

            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            var path = rewriteView(type, viewName);
            entityInfo.nanoDb.view(path[0], path[1], args, function (err, body) {
                if (err) return callback(fixViewError(entityInfo, path, err));

                callback(null, body.rows);
            });
        },

        list: function (type, listName, viewName, args, callback) {
            if (!_.isFunction(callback)) throw new Error('callback required');
            if (typeof type !== 'string') return callback(new Error('type required'));
            if (typeof listName !== 'string') return callback(new Error('listName required'));
            if (typeof viewName !== 'string') return callback(new Error('viewName required'));
            if (!args) return callback(new Error('args required'));

            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

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

            request({
                uri: entityInfo.databaseUrl + '/_design/' + path[0] + '/_list/' + listName + '/' + path[1] +
                    (argsKeys.length ? '?' + require('querystring').stringify(qs) : '')
            }, function (err, res, body) {
                if (err) return callback(err);
                if (res.statusCode !== 200) return callback(new Error('Status code != 200. Was ' + res.statusCode));

                callback(null, body);
            });
        },

        get: function (type, id, callback) {
            if (!_.isFunction(callback)) throw new Error('callback required');
            if (typeof type !== 'string') return callback(new Error('type required'));
            if (typeof id !== 'string') return callback(new Error('id required'));

            this.getOrNull(type, id, function (err, entity) {
                if (err) return callback(err);
                if (entity === null) {
                    return callback(new Error('Entity is missing. Type=' + type + '. ID=' + id));
                }

                callback(null, entity);
            });
        },

        getOrNull: function (type, id, callback) {
            if (!_.isFunction(callback)) throw new Error('callback required');
            if (!id) return callback(null, null);
            if (typeof type !== 'string') return callback(new Error('type required'));

            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            var cache = entityInfo.cache;

            var cachedDocString = cache.get(id);
            if (cachedDocString) {
                var cachedDoc = JSON.parse(cachedDocString);
                var entity = entityInfo.creator(cachedDoc);
                return callback(null, entity);
            }

            entityInfo.nanoDb.get(id, function (err, doc) {
                if (err) {
                    if (err.status_code === 404) {
                        return callback(null, null);
                    }

                    return callback(fixNanoError(entityInfo, err));
                }

                if (!cache.isNullCache) { // Performance optimization to skip JSON.stringify()
                    cache.set(id, JSON.stringify(doc));
                }
                var entity = entityInfo.creator(doc);

                callback(null, entity);
            });
        },

        save: function (entity, callback) {
            if (!_.isFunction(callback)) throw new Error('callback required');
            if (!entity) return callback(new Error('entity required'));

            var type = entity.type;
            var entityInfo = entityInfoMap[type];

            var doc = toDoc(entity);
            var docId = doc._id;
            delete doc._id;

            if (!entityInfo) return callback(new Error('Type not defined=' + type));
            if (doc._rev) return callback(new Error('_rev should not be defined when saving'));


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
                        if (err) return callback(new Error(fixNanoError(entityInfo, err)));

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
        },

        update: function (entity, callback) {
            if (!_.isFunction(callback)) throw new Error('callback required');
            if (!entity) return callback(new Error('entity required'));

            var type = entity.type;
            var entityInfo = entityInfoMap[type];
            var doc = toDoc(entity);
            if (!entityInfo) return callback(new Error('Type not defined=' + type));
            if (!doc._id) return callback(new Error('_id is required'));
            if (!doc._rev) return callback(new Error('_rev is required'));

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
                    entityInfo.cache.del(docId);
                    entityInfo.nanoDb.insert(doc, docId, function (err, response) {
                        if (err) return callback(fixNanoError(entityInfo, err));

                        entity._rev = response.rev;
                        callback();
                    });
                });
            });
        },

        merge: function (type, id, changedProperties, callback) {
            if (!_.isFunction(callback)) throw new Error('callback required');
            if (typeof type !== 'string') return callback(new Error('type required'));
            if (typeof id !== 'string') return callback(new Error('id required'));
            if (!changedProperties) return callback(new Error('changedProperties required'));

            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            this.get(type, id, function (err, entity) {
                if (err) return callback(err);

                _.extend(entity, changedProperties);

                var doc = toDoc(entity);
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

                        entityInfo.cache.del(id);
                        entityInfo.nanoDb.insert(doc, id, function (err, res) {
                            if (err) return callback(fixNanoError(entityInfo, err));

                            callback(null, { rev: res.rev });
                        });
                    })
                });
            });
        },

        remove: function (type, id, callback) {
            if (!_.isFunction(callback)) throw new Error('callback required');
            if (typeof type !== 'string') return callback(new Error('type required'));
            if (typeof id !== 'string') return callback(new Error('id required'));

            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            this.get(type, id, function (err, entity) {
                if (err) return callback(err);

                entityInfo.cache.del(id);
                entityInfo.nanoDb.destroy(id, entity._rev, function (err, result) {
                    if (err) return callback(fixNanoError(entityInfo, err));

                    callback(null, result);
                });
            });
        }
    };
};

module.exports.fake = require('./fake.js');