var _ = require('underscore');
var sinon = require('sinon');

function get() {
    var args = Array.prototype.slice.call(arguments);
    return function (type, id, cb) {
        for (var i = 0; i < args.length; i++) {
            if (args[i].type === type && args[i]._id === id) {
                cb(null, args[i]);
                return;
            }
        }
        cb(new Error('Not found. Type=' + type + ' ID=' + id));
    };
}


function getOrNull() {
    var args = Array.prototype.slice.call(arguments);
    return function (type, id, cb) {
        for (var i = 0; i < args.length; i++) {
            if (args[i].type === type && args[i]._id === id) {
                cb(null, args[i]);
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
                    typeKey =  name.split('/')[0];
                    nameKey =  name.split('/')[1];
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

var fakeAll = function (options) {
    var idMap = {};
    var validKeys = ['entities', 'views', 'viewsRaw', 'save', 'merge', 'update', 'remove', 'enableAutoId'];
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
    if (!_.isArray(entities)) {
        throw new Error('"entities" must be an array');
    }

    return {
        get: get.apply(null, entities),
        getOrNull: getOrNull.apply(null, entities),
        view: view(options.views || {}),
        viewValue: view(options.views || {}),
        viewRaw: view(options.viewsRaw || {}),
        save: options.save || sinon.spy(function (entity, cb) {
            if (options.enableAutoId) {
                var type = entity.type;
                var number = (idMap[type] || 0) + 1;
                entity._id = type + '_' + number;
                idMap[type] = number;
            }
            cb();
        }),
        update: options.update || sinon.spy(function (entity, cb) {
            cb();
        }),
        merge: options.merge || sinon.spy(function (type, id, changedProperties, cb) {
            cb(null, {});
        }),
        remove: options.remove || sinon.spy(function (type, id, cb) {
            cb();
        })
    };
};

function fakeSmartDb(options) {
    return fakeAll(options);
}

module.exports = fakeSmartDb;