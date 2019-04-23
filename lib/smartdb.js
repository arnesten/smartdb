let nano = require('nano');
let request = require('request');
let url = require('url');
let cacheProviders = require('smartdb-stdcacheproviders');
let inMemoryCacheProvider = cacheProviders.inMemoryCacheProvider;
let fake = require('./fake.js');
let querystring = require('querystring');

module.exports = smartdb;
smartdb.fake = fake;
smartdb.cacheProviders = cacheProviders;

function smartdb(createOptions) {
    let typeProperty = createOptions.typeProperty || 'type';

    let docToEntity = createOptions.mapDocToEntity || (doc => doc);
    let entityToDoc = createOptions.mapEntityToDoc || (entity => JSON.parse(JSON.stringify(entity)));
    let rewriteView = createOptions.rewriteView || ((type, viewName) => [type, viewName]);
    let validate = createOptions.validate || (() => Promise.resolve());
    let cacheProvider = createOptions.cacheProvider || inMemoryCacheProvider;
    let generateId = createOptions.generateId;

    let requestDefaults = createOptions.requestDefaults || {};

    let entityInfoMap = {};

    createOptions.databases.forEach(databaseInfo => {
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
                nanoDb,
                cache: cacheProvider.create(entityType, entitySettings)
            };
        });
    });

    return {
        view,
        viewValue,
        viewRaw,
        list,
        get,
        getBulk,
        getOrNull,
        save,
        update,
        updateWithRetry,
        merge,
        remove,
        removeCacheOnly
    };

    async function view(type, viewName, args) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(viewName)) throw new Error('viewName required');
        if (!args) throw new Error('args required');

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let viewArgs = { include_docs: true, ...args };
        let path = rewriteView(type, viewName);
        let body = await entityInfo.nanoDb.view(path[0], path[1], viewArgs)
            .catch(err => { throw fixViewError(entityInfo, path, err) });
        if (!body) throw bodyMissingError(path);
        if (!body.rows) throw rowsMissingError(path);

        return body.rows
            .filter(row => row.doc)
            .map(row => docToEntity(row.doc));
    }

    async function viewValue(type, viewName, args) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(viewName)) throw new Error('viewName required');
        if (!args) throw new Error('args required');

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let path = rewriteView(type, viewName);
        let body = await entityInfo.nanoDb.view(path[0], path[1], args)
            .catch(err => { throw fixViewError(entityInfo, path, err) });
        if (!body) throw bodyMissingError(path);
        if (!body.rows) throw rowsMissingError(path);

        return body.rows.map(row => row.value);
    }

    async function viewRaw(type, viewName, args) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(viewName)) throw new Error('viewName required');
        if (!args) throw new Error('args required');

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let path = rewriteView(type, viewName);
        let body = await entityInfo.nanoDb.view(path[0], path[1], args)
            .catch(err => { throw fixViewError(entityInfo, path, err) });
        if (!body) throw bodyMissingError(path);
        if (!body.rows) throw rowsMissingError(path);

        return body.rows;
    }

    async function list(type, listName, viewName, args) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(listName)) throw new Error('listName required');
        if (!isStringWithLength(viewName)) throw new Error('viewName required');
        if (!args) throw new Error('args required');

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

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

        return new Promise((resolve, reject) => {
            req({
                uri: entityInfo.databaseUrl + '/_design/' + path[0] + '/_list/' + listName + '/' + path[1] +
                    (argsKeys.length ? '?' + querystring.stringify(qs) : '')
            }, (err, res, body) => {
                if (err) return reject(err);
                if (res.statusCode !== 200) return reject(new Error('Status code != 200. Was ' + res.statusCode));

                resolve(body);
            });
        });
    }

    async function get(type, id) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(id)) throw new Error('id required');

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let cache = entityInfo.cache;

        let cachedDoc = await cache.get(id);
        if (cachedDoc) {
            return docToEntity(cachedDoc);
        }

        let doc = await entityInfo.nanoDb.get(id)
            .catch(err => {
                fixNanoError(entityInfo, err);
                if (err.statusCode === 404) {
                    throw entityMissingError(err, {
                        entityId: id,
                        entityType: type
                    });
                }
                throw err;
            });
        if (doc[typeProperty] !== type) {
            throw entityMissingError({}, {
                entityId: id,
                entityType: type
            });
        }

        await cache.set(id, doc);
        return docToEntity(doc);
    }

    async function getBulk(type, id) {

    }

    async function getOrNull(type, id) {
        if (!id) return null;
        if (!isStringWithLength(type)) throw new Error('type required');

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let cache = entityInfo.cache;

        let cachedDoc = await cache.get(id);
        if (cachedDoc) {
            return docToEntity(cachedDoc);
        }

        let doc = await entityInfo.nanoDb.get(id).catch(err => {
            if (err.statusCode === 404) {
                return null;
            }
            throw fixNanoError(entityInfo, err);
        });
        if (!doc) return null;
        if (doc[typeProperty] !== type) return null;

        await cache.set(id, doc);
        return docToEntity(doc);
    }

    async function save(entity) {
        if (!entity) throw new Error('entity required');

        let type = entity[typeProperty];
        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let doc = entityToDoc(entity);
        if (doc._rev) throw new Error('_rev should not be defined when saving');

        await validate(entity);

        let docId = doc._id;
        if (docId) {
            delete doc._id;
        }
        try {
            let promise;
            if (docId) {
                promise = entityInfo.nanoDb.insert(doc, docId);
            }
            else if (generateId) {
                promise = insertWithGeneratedIdAndConflictRetry(entityInfo.nanoDb, doc);
            }
            else {
                promise = entityInfo.nanoDb.insert(doc);
            }
            let { id, rev } = await promise;
            entity._id = id;
            entity._rev = rev;

            await entityInfo.cache.set(id, getCacheDoc(doc, id, rev));
        }
        catch (err) {
            fixNanoError(entityInfo, err);
            if (err.statusCode === 409) {
                throw entityConflictError(err, {
                    entityId: docId,
                    entityType: type
                });
            }
            throw err;
        }
    }

    async function insertWithGeneratedIdAndConflictRetry(nanoDb, doc) {
        try {
            let docId = await generateId(doc);
            return await nanoDb.insert(doc, docId);
        }
        catch (err) {
            if (err.statusCode === 409) {
                let docId = await generateId(doc);
                return await nanoDb.insert(doc, docId);
            }
            throw err;
        }
    }

    async function update(entity) {
        if (!entity) throw new Error('entity required');

        let type = entity[typeProperty];
        let entityInfo = entityInfoMap[type];
        let doc = entityToDoc(entity);
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);
        if (!doc._id) throw new Error('_id is required');
        if (!doc._rev) throw new Error('_rev is required');

        await validate(entity);

        let id = doc._id;
        delete doc._id;
        await entityInfo.cache.del(id);

        let { rev } = await entityInfo.nanoDb.insert(doc, id).catch(err => {
            fixNanoError(entityInfo, err);
            if (err.statusCode === 409) {
                throw entityConflictError(err, {
                    entityId: id,
                    entityType: type
                });
            }
            throw err;
        });

        entity._rev = rev;
        await entityInfo.cache.set(id, getCacheDoc(doc, id, rev));
    }

    async function updateWithRetry(type, id, updateFunction) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(id)) throw new Error('id required');
        if (!isFunction(updateFunction)) throw new Error('updateFunction required');

        try {
            let entity = await get(type, id);
            let result = await updateFunction(entity);
            if (result !== false) {
                await update(entity);
            }
            return entity;
        }
        catch (err) {
            let entity = await get(type, id);
            let result = await updateFunction(entity);
            if (result !== false) {
                await update(entity);
            }
            return entity;
        }
    }

    async function merge(type, id, changedProperties) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(id)) throw new Error('id required');
        if (!changedProperties) throw new Error('changedProperties required');

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let entity = await get(type, id);

        Object.assign(entity, changedProperties);

        let doc = entityToDoc(entity);
        delete doc._id;

        await validate(entity);
        await entityInfo.cache.del(id);

        let { rev } = await entityInfo.nanoDb.insert(doc, id).catch(err => {
            fixNanoError(entityInfo, err);
            if (err.statusCode === 409) {
                throw entityConflictError(err, {
                    entityId: id,
                    entityType: type
                });
            }
            throw err;
        });

        await entityInfo.cache.set(id, getCacheDoc(doc, id, rev));
        return { rev };
    }

    async function remove(type, id) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(id)) throw new Error('id required');

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let entity = await get(type, id);

        await entityInfo.cache.del(id);

        return await entityInfo.nanoDb.destroy(id, entity._rev).catch(err => {
            fixNanoError(entityInfo, err);
            if (err.statusCode === 409) {
                throw entityConflictError(err, {
                    entityId: id,
                    entityType: type
                });
            }
            throw err;
        });
    }

    async function removeCacheOnly(type, id) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(id)) throw new Error('id required');

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        await entityInfo.cache.del(id);
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
            return new Error(`View not found: _design/${path[0]}/_view/${path[1]}`);
        }
        return fixNanoError(entityInfo, err);
    }

    function bodyMissingError(path) {
        // Had this problem in production while having network issues. Cause "Uncaught exception" to happen.
        return new Error(`View returned an undefined body: _design/${path[0]}/_view/${path[1]}`);
    }

    function rowsMissingError(path) {
        // Had this problem in production while having network issues. Cause "Uncaught exception" to happen.
        return new Error(`View returned an body without rows: _design/${path[0]}/_view/${path[1]}`);
    }

    function isFunction(fn) {
        return typeof fn === 'function';
    }

    function isStringWithLength(str) {
        return typeof str === 'string' && str.length > 0;
    }

    function entityConflictError(err, options) {
        return createError({
            name: 'EntityConflictError',
            message: 'Conflict when trying to persist entity change',
            scope: 'smartdb',
            request: err.request,
            response: {
                statusCode: err.statusCode,
                headers: err.headers
            },
            ...options
        });
    }

    function entityMissingError(err, options) {
        return createError({
            name: 'EntityMissingError',
            message: 'Entity is missing',
            scope: 'smartdb',
            request: err.request,
            response: {
                statusCode: err.statusCode,
                headers: err.headers
            },
            ...options
        });
    }

    function createError(extend) {
        let error = new Error();
        Object.assign(error, extend);
        return error;
    }

    function getCacheDoc(doc, id, rev) {
        // We want to force _id and _rev to be first, but doc._id can be set to undefined
        let idRev = { _id: id, _rev: rev };
        return { ...idRev, ...doc, ...idRev };
    }
}