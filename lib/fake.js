var sinon = require('sinon');

module.exports = fakeSmartDb;

function fakeSmartDb(options) {
    var idMap = {};
    var validKeys = ['entities', 'views', 'viewsRaw', 'save', 'merge', 'update', 'remove', 'enableAutoId', 'async'];
    for (var name in options) {
        if (options.hasOwnProperty(name)) {
            var valid = validKeys.some(function (key) {
                return key === name;
            });
            if (!valid) {
                throw new Error('No match for "' + name + '". Misspelled?');
            }
        }
    }
    var entities = options.entities || [];
    if (!Array.isArray(entities)) {
        throw new Error('"entities" must be an array');
    }
    var fnWrapper = options.async ? makeAsync : function (value) {
        return value;
    };

    return {
        get: fnWrapper(get(entities)),
        getOrNull: fnWrapper(getOrNull(entities)),
        view: fnWrapper(view(options.views || {})),
        viewValue: fnWrapper(view(options.views || {})),
        viewRaw: fnWrapper(view(options.viewsRaw || {})),
        save: options.save || fnWrapper(sinon.spy(function (entity, cb) {
            if (options.enableAutoId) {
                var type = entity.type;
                var number = (idMap[type] || 0) + 1;
                entity._id = type + '_' + number;
                idMap[type] = number;
            }
            cb();
        })),
        update: options.update || fnWrapper(sinon.spy(function (entity, cb) {
            cb();
        })),
        merge: options.merge || fnWrapper(sinon.spy(function (type, id, changedProperties, cb) {
            cb(null, {});
        })),
        remove: options.remove || fnWrapper(sinon.spy(function (type, id, cb) {
            cb();
        }))
    };
}

function get(entities) {
    return function (type, id, cb) {
        for (var i = 0; i < entities.length; i++) {
            if (entities[i].type === type && entities[i]._id === id) {
                cb(null, entities[i]);
                return;
            }
        }
        cb(new Error('Not found. Type=' + type + ' ID=' + id));
    };
}

function getOrNull(entities) {
    return function (type, id, cb) {
        for (var i = 0; i < entities.length; i++) {
            if (entities[i].type === type && entities[i]._id === id) {
                cb(null, entities[i]);
                return;
            }
        }
        cb(null, null);
    };
}

function view(viewFnMap) {
    return function (type, viewName, args, cb) {
        for (var name in viewFnMap) {
            if (viewFnMap.hasOwnProperty(name)) {
                var typeKey = type;
                var nameKey = name;
                if (name.indexOf('/') >= 0) {
                    typeKey = name.split('/')[0];
                    nameKey = name.split('/')[1];
                }
                if (type == typeKey && viewName === nameKey) {
                    var result = viewFnMap[name](args);
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
        var that = this;
        var args = arguments;
        process.nextTick(function () {
            fn.apply(that, args);
        });
    }
}