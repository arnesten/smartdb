'use strict';
let sinon = require('sinon');

module.exports = fakeSmartDb;

function fakeSmartDb(options) {
    let idMap = {};
    let validKeys = ['entities', 'views', 'viewsRaw', 'save', 'merge', 'update', 'remove', 'enableAutoId', 'async'];
    for (let name in options) {
        if (options.hasOwnProperty(name)) {
            let valid = validKeys.some(key => key === name);
            if (!valid) {
                throw new Error('No match for "' + name + '". Misspelled?');
            }
        }
    }
    let entities = options.entities || [];
    if (!Array.isArray(entities)) {
        throw new Error('"entities" must be an array');
    }
    let fnWrapper = options.async ? asyncFnWrapper : syncFnWrapper;

    return {
        get: fnWrapper(get(entities)),
        getOrNull: fnWrapper(getOrNull(entities)),
        view: fnWrapper(view(options.views || {})),
        viewValue: fnWrapper(view(options.views || {})),
        viewRaw: fnWrapper(view(options.viewsRaw || {})),
        save: options.save || sinon.spy(fnWrapper((entity, callback) => {
            if (options.enableAutoId) {
                let type = entity.type;
                let number = (idMap[type] || 0) + 1;
                entity._id = type + '_' + number;
                idMap[type] = number;
            }
            callback();
        })),
        update: options.update || sinon.spy(fnWrapper((entity, callback) => {
            callback();
        })),
        merge: options.merge || sinon.spy(fnWrapper((type, id, changedProperties, callback) => {
            callback(null, {});
        })),
        remove: options.remove || sinon.spy(fnWrapper((type, id, callback) => {
            callback();
        }))
    };
}

function get(entities) {
    return (type, id, callback) => {
        for (let i = 0; i < entities.length; i++) {
            if (entities[i].type === type && entities[i]._id === id) {
                callback(null, entities[i]);
                return;
            }
        }
        callback(new Error('Not found. Type=' + type + ' ID=' + id));
    };
}

function getOrNull(entities) {
    return (type, id, callback) => {
        for (let i = 0; i < entities.length; i++) {
            if (entities[i].type === type && entities[i]._id === id) {
                callback(null, entities[i]);
                return;
            }
        }
        callback(null, null);
    };
}

function view(viewFnMap) {
    return (type, viewName, args, callback) => {
        for (let name in viewFnMap) {
            if (viewFnMap.hasOwnProperty(name)) {
                let typeKey = type;
                let nameKey = name;
                if (name.indexOf('/') >= 0) {
                    typeKey = name.split('/')[0];
                    nameKey = name.split('/')[1];
                }
                if (type == typeKey && viewName === nameKey) {
                    let result = viewFnMap[name](args);
                    callback(result[0], result[1]);
                    return;
                }
            }
        }
        callback(null, []);
    };
}

function asyncFnWrapper(fn) {
    return (...args) => {
        let last = args[args.length - 1];
        let hasCallback = typeof last === 'function';
        if (hasCallback) {
            process.nextTick(() => {
                fn(...args);
            });
        }
        else {
            return new Promise((resolve, reject) => {
                process.nextTick(() => {
                    fn(...args, (err, result) => {
                        if (err) return reject(err);
                        resolve(result);
                    });
                });
            });
        }
    };
}

function syncFnWrapper(fn) {
    return promisify((...args) => {
        return fn(...args);
    });
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