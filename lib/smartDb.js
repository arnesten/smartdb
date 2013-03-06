var nano = require('nano');
var _ = require('underscore');
var lru = require('lru-cache');
var request = require('request');

var noCache = {
    get: function () {
    },
    set: function () {
    },
    del: function () {
    },
    reset: function () {
    }
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
        var url = databaseInfo.url;
        var nanoDb = nano({
            url: url,
            request_defaults: {
                pool: {
                    maxSockets: 100
                }
            }
        });
        Object.keys(databaseInfo.entities).forEach(function (entityType) {
            var entitySettings = databaseInfo.entities[entityType];
            entityInfoMap[entityType] = {
                databaseUrl: url,
                nanoDb: nanoDb,
                creator: getEntityCreator(entityType),
                cache: createCache(entitySettings)
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

        return noCache;
    }

    function fixViewError(path, err) {
        if (err.status_code === 404) {
            return new Error('View not found: _design/' + path[0] + '/_view/' + path[1]);
        }
        return err;
    }

    return {
        view: function (type, viewName, args, callback) {
            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            var viewArgs = _.extend({ include_docs: true }, args);
            var path = rewriteView(type, viewName);
            entityInfo.nanoDb.view(path[0], path[1], viewArgs, function (err, body) {
                if (err) return callback(fixViewError(path, err));

                var entities = body.rows
                    .map(function (row) {
                        return entityInfo.creator(row.doc)
                    });
                callback(null, entities);
            });
        },

        viewValue: function (type, viewName, args, callback) {
            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            var path = rewriteView(type, viewName);
            entityInfo.nanoDb.view(path[0], path[1], args, function (err, body) {
                if (err) return callback(fixViewError(path, err));

                var values = body.rows
                    .map(function (row) {
                        return row.value
                    });
                callback(null, values);
            });
        },

        viewRaw: function (type, viewName, args, callback) {
            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            var path = rewriteView(type, viewName);
            entityInfo.nanoDb.view(path[0], path[1], args, function (err, body) {
                if (err) return callback(fixViewError(path, err));

                callback(null, body.rows);
            });
        },

        list: function (type, listName, viewName, args, callback) {
            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            var path = rewriteView(type, viewName);

            var qs = {};
            Object.keys(args).forEach(function (key) {
                var value = args[key];
                ['startkey', 'endkey', 'key', 'keys'].forEach(function (specialKey) {
                    if (key === specialKey) {
                        qs[key] = JSON.stringify(value);
                    }
                    else {
                        qs[key] = value;
                    }
                });
            });

            request({
                url: entityInfo.databaseUrl + '/_design/' + path[0] + '/_list/' + listName + '/' + path[1],
                qs: qs
            }, function (err, res, body) {
                if (err) return callback(err);
                if (res.statusCode !== 200) return callback(new Error('Status code != 200. Was ' + res.statusCode));

                callback(null, body);
            });
        },

        get: function (type, id, callback) {
            if (!id) return callback(new Error('ID is required'));

            this.getOrNull(type, id, function (err, entity) {
                if (err) return callback(err);
                if (entity === null) {
                    return callback(new Error('Entity is missing. Type=' + type + '. ID=' + id));
                }

                callback(null, entity);
            });
        },

        getOrNull: function (type, id, callback) {
            if (!id) return callback(null, null);

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

                    return callback(err);
                }

                cache.set(id, JSON.stringify(doc));
                var entity = entityInfo.creator(doc);

                callback(null, entity);
            });
        },

        save: function (entity, callback) {
            var type = entity.type;
            var entityInfo = entityInfoMap[type];
            var doc = toDoc(entity);
            if (!entityInfo) return callback(new Error('Type not defined=' + type));
            if (doc._rev) return callback(new Error('_rev should not be defined when saving'));

            validate(entity, function (err) {
                if (err) return callback(err);

                var handler = function (err, response) {
                    if (err) return callback(new Error(err));

                    entity._id = response.id;
                    entity._rev = response.rev;
                    callback();
                };

                var docId = doc._id;
                if (docId) {
                    delete doc._id;
                    entityInfo.nanoDb.insert(doc, docId, handler);
                }
                else {
                    entityInfo.nanoDb.insert(doc, handler);
                }
            })
        },

        update: function (entity, callback) {
            var type = entity.type;
            var entityInfo = entityInfoMap[type];
            var doc = toDoc(entity);
            if (!entityInfo) return callback(new Error('Type not defined=' + type));
            if (!doc._id) return callback(new Error('_id is required'));
            if (!doc._rev) return callback(new Error('_rev is required'));

            validate(entity, function (err) {
                if (err) return callback(err);

                var docId = doc._id;
                delete doc._id;
                entityInfo.cache.del(docId);
                entityInfo.nanoDb.insert(doc, docId, function (err, response) {
                    if (err) return callback(err);

                    entity._rev = response.rev;
                    callback();
                });
            });
        },

        merge: function (type, id, changedProperties, callback) {
            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            this.get(type, id, function (err, entity) {
                if (err) return callback(err);

                validate(entity, function (err) {
                    if (err) return callback(err);

                    var doc = _.extend(entity, changedProperties);
                    delete doc._id;
                    entityInfo.cache.del(id);
                    entityInfo.nanoDb.insert(doc, id, function (err, res) {
                        if (err) return callback(err);

                        callback(null, { rev: res.rev });
                    });
                });
            });
        },

        remove: function (type, id, callback) {
            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            this.get(type, id, function (err, entity) {
                if (err) return callback(err);

                entityInfo.cache.del(id);
                entityInfo.nanoDb.destroy(id, entity._rev, function (err, result) {
                    if (err) return callback(err);

                    callback(null, result);
                });
            });
        }
    };
};