import nano from 'nano';
import request from 'request';
import url from 'url';
import { inMemoryCacheProvider, nullCacheProvider } from 'smartdb-stdcacheproviders';
import querystring from 'querystring';

const MAX_UPDATE_RETRIES = 3;

SmartDb.cacheProviders = { inMemoryCacheProvider, nullCacheProvider };
SmartDb.withCallbacks = createOptions => {
    let db = SmartDb(createOptions);
    return Object.assign(db, {
        view: callbackify(db.view),
        viewValue: callbackify(db.viewValue),
        viewRaw: callbackify(db.viewRaw),
        list: callbackify(db.list),
        get: callbackify(db.get),
        getOrNull: callbackify(db.getOrNull),
        save: callbackify(db.save),
        update: callbackify(db.update),
        merge: callbackify(db.merge),
        remove: callbackify(db.remove)
    });
};

export default function SmartDb(createOptions) {
    let typeProperty = createOptions.typeProperty || 'type';
    let docToEntity = createOptions.mapDocToEntity || (doc => doc);
    let entityToDoc = createOptions.mapEntityToDoc || (entity => JSON.parse(JSON.stringify(entity)));
    let rewriteView = createOptions.rewriteView || ((type, viewName) => [type, viewName]);
    let rewriteIndexName = createOptions.rewriteIndexName || ((type, indexName) => indexName);
    let findHook = createOptions.findHook || (() => {});
    let validate = createOptions.validate || (() => Promise.resolve());
    let cacheProvider = createOptions.cacheProvider || inMemoryCacheProvider;
    let generateId = createOptions.generateId;
    let defaultFindLimit = createOptions.defaultFindLimit;
    let requestDefaults = createOptions.requestDefaults || {};
    let entityInfoMap = {};
    for (let databaseInfo of createOptions.databases) {
        let databaseUrl = databaseInfo.url;
        let urlObj = url.parse(databaseUrl);
        delete urlObj.auth;
        let safeDatabaseUrl = url.format(urlObj);
        let nanoOptions = {
            url: databaseUrl,
            requestDefaults
        };
        let nanoDb = nano(nanoOptions);
        for (let [entityType, entitySettings] of Object.entries(databaseInfo.entities)) {
            entityInfoMap[entityType] = {
                databaseUrl,
                safeDatabaseUrl,
                nanoDb,
                cache: cacheProvider.create(entityType, entitySettings)
            };
        }
    }

    return {
        view,
        viewValue,
        viewRaw,
        find,
        list,
        get,
        getBulk,
        getOrNull,
        getOrNullBulk,
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
        validateViewArgs(args);

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let viewArgs = { include_docs: true, ...args };
        let path = rewriteView(type, viewName);
        let body = await entityInfo.nanoDb.view(path[0], path[1], viewArgs)
            .catch(err => { throw fixViewError(entityInfo, path, err) });
        if (!body) throw bodyMissingError(path);
        let rows = body.rows;
        if (!rows) throw rowsMissingError(path);

        let result = [];
        for (let { doc } of rows) {
            if (doc) {
                result.push(docToEntity(doc));
            }
        }
        return result;
    }

    async function viewValue(type, viewName, args) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(viewName)) throw new Error('viewName required');
        validateViewArgs(args);

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let path = rewriteView(type, viewName);
        let body = await entityInfo.nanoDb.view(path[0], path[1], args)
            .catch(err => { throw fixViewError(entityInfo, path, err) });
        if (!body) throw bodyMissingError(path);
        let rows = body.rows;
        if (!rows) throw rowsMissingError(path);

        return rows.map(row => row.value);
    }

    async function viewRaw(type, viewName, args) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(viewName)) throw new Error('viewName required');
        validateViewArgs(args);

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let path = rewriteView(type, viewName);
        let body = await entityInfo.nanoDb.view(path[0], path[1], args)
            .catch(err => { throw fixViewError(entityInfo, path, err) });
        if (!body) throw bodyMissingError(path);
        let rows = body.rows;
        if (!rows) throw rowsMissingError(path);

        return rows;
    }

    async function find(type, indexName, args) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!isStringWithLength(indexName)) throw new Error('indexName required');
        if (!args) throw new Error('args required');

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        if (!args.selector) {
            args = { selector: args };
        }
        let findArgs = {
            ...args,
            use_index: rewriteIndexName(type, indexName)
        };
        if (defaultFindLimit && !findArgs.limit) {
            findArgs.limit = defaultFindLimit;
        }
        findHook(type, indexName, findArgs);

        let result = await entityInfo.nanoDb.find(findArgs);
        if (result.warning) {
            throw new Error(result.warning);
        }

        return result.docs.map(doc => docToEntity(doc));
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
        for (let key of argsKeys) {
            let value = args[key];
            if (specialKeys.includes(key)) {
                qs[key] = JSON.stringify(value);
            }
            else {
                qs[key] = value;
            }
        }

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

    async function getBulk(type, ids) {
        let entities = await getOrNullBulk(type, ids);
        let missingIds = [];
        for (let [index, entity] of entities.entries()) {
            if (!entity) {
                let id = ids[index];
                missingIds.push(id);
            }
        }
        if (missingIds.length) {
            throw entityMissingError({}, {
                entityIds: missingIds,
                entityType: type
            });
        }
        return entities;
    }

    async function getOrNullBulk(type, ids) {
        if (!isStringWithLength(type)) throw new Error('type required');
        if (!Array.isArray(ids)) throw new Error('ids must be array');
        let isAllStrings = ids.every(id => typeof id === 'string');
        if (!isAllStrings) throw new Error('ids array contain non-string element');
        if (ids.length === 0) return [];

        if (ids.length === 1) {
            let entity = await getOrNull(type, ids[0]);
            return [entity];
        }

        let entityInfo = entityInfoMap[type];
        if (!entityInfo) throw new Error(`Type not defined "${type}"`);

        let cache = entityInfo.cache;

        let cachedDocs = await Promise.all(ids.map(id => cache.get(id)));
        let isAllCached = cachedDocs.every(doc => doc);
        if (isAllCached) {
            return cachedDocs.map(doc => docToEntity(doc));
        }

        let { rows } = await entityInfo.nanoDb.fetch({ keys: ids })
            .catch(err => {
                fixNanoError(entityInfo, err);
                throw err;
            });

        let cacheSetPromises = [];
        let result = [];
        for (let { doc } of rows) {
            if (doc && doc[typeProperty] === type) {
                cacheSetPromises.push(cache.set(doc._id, doc));
                result.push(docToEntity(doc));
            }
            else {
                result.push(null);
            }
        }
        await Promise.all(cacheSetPromises);

        return result;
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
                return insertWithGeneratedIdAndConflictRetry(nanoDb, doc);
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

        let lastIndex = MAX_UPDATE_RETRIES - 1;
        for (let i = 0; i < MAX_UPDATE_RETRIES; i++) {
            let entity = await get(type, id);
            try {
                let result = await updateFunction(entity);
                if (result !== false) {
                    await update(entity);
                }
                return entity;
            }
            catch (err) {
                if (i === lastIndex ) {
                    throw err;
                }
            }
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

    function validateViewArgs(args) {
        if (!args) throw new Error('args required');
        if ('key' in args && args.key === undefined) throw new Error('"key" should not be set to undefined since that will fetch any documents');
    }
}

function callbackify(fn) {
    return (...args) => {
        let lastArg = args[args.length - 1];
        let hasCallback = typeof lastArg === 'function';
        if (hasCallback) {
            let callback = lastArg;
            let argsWithoutCallback = args.slice(0, -1);
            fn(...argsWithoutCallback).then(result => {
                callback(null, result);
            }, err => {
                callback(err);
            });
        }
        else {
            return fn(...args);
        }
    };
}