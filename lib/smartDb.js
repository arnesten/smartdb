var nano = require('nano');

module.exports = function (options) {

    var getEntityCreator = options.getEntityCreator || function () {
        return function (doc) {
            return doc;
        };
    };
    var toDoc = options.mapEntityToDoc = function (entity) {
        return JSON.parse(JSON.stringify(entity));
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
            entityInfoMap[entityType] = {
                nanoDb: nanoDb,
                creator: getEntityCreator(entityType)
            };
        });
    });

    return {
        get: function (type, id, callback) {
            var entityInfo = entityInfoMap[type];
            if (!entityInfo) return callback(new Error('Type not defined=' + type));

            entityInfo.nanoDb.get(id, function (err, doc) {
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
        },
        update: function (entity, callback) {
            var type = entity.type;
            var entityInfo = entityInfoMap[type];
            var doc = toDoc(entity);
            if (!entityInfo) return callback(new Error('Type not defined=' + type));
            if (!doc._id) return callback(new Error('_id is required'));
            if (!doc._rev) return callback(new Error('_rev is required'));

            var docId = doc._id;
            delete doc._id;
            entityInfo.nanoDb.insert(doc, docId, function (err, response) {
                if (err) return callback(err);

                entity._rev = response.rev;
                callback();
            });
        },
        merge: function (type, id, changedProperties, callback) {

        },
        remove: function (type, id, callback) {

        }
    };
};