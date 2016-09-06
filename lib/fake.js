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
    let fnWrapper = options.async ? makeAsync : (value => value);

    return {
        get: fnWrapper(get(entities)),
        getOrNull: fnWrapper(getOrNull(entities)),
        view: fnWrapper(view(options.views || {})),
        viewValue: fnWrapper(view(options.views || {})),
        viewRaw: fnWrapper(view(options.viewsRaw || {})),
        save: options.save || fnWrapper(sinon.spy((entity, cb) => {
            if (options.enableAutoId) {
                let type = entity.type;
                let number = (idMap[type] || 0) + 1;
                entity._id = type + '_' + number;
                idMap[type] = number;
            }
            cb();
        })),
        update: options.update || fnWrapper(sinon.spy((entity, cb) => { cb(); })),
        merge: options.merge || fnWrapper(sinon.spy((type, id, changedProperties, cb) => { cb(null, {}); })),
        remove: options.remove || fnWrapper(sinon.spy((type, id, cb) => { cb(); }))
    };
}

function get(entities) {
    return (type, id, cb) => {
        for (let i = 0; i < entities.length; i++) {
            if (entities[i].type === type && entities[i]._id === id) {
                cb(null, entities[i]);
                return;
            }
        }
        cb(new Error('Not found. Type=' + type + ' ID=' + id));
    };
}

function getOrNull(entities) {
    return (type, id, cb) => {
        for (let i = 0; i < entities.length; i++) {
            if (entities[i].type === type && entities[i]._id === id) {
                cb(null, entities[i]);
                return;
            }
        }
        cb(null, null);
    };
}

function view(viewFnMap) {
    return (type, viewName, args, cb) => {
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
                    cb(result[0], result[1]);
                    return;
                }
            }
        }
        cb(null, []);
    };
}

function makeAsync(fn) {
    return function () {
        let args = arguments;
        process.nextTick(() => {
            fn.apply(this, args);
        });
    }
}