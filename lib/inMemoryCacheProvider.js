var lru = require('lru-cache');
var nullCacheProvider = require('./nullCacheProvider.js');

module.exports.create = function (entityType, entitySettings) {

	var maxSize = entitySettings.cacheMaxSize;
	var maxAge = entitySettings.cacheMaxAge;
	if (!maxSize && !maxAge) return nullCacheProvider.create();

	var lruCache = lru({
		max: maxSize || 10000,
		maxAge: maxAge
	});

	return {
		get: function (id, cb) {
			var value = lruCache.get(id);
			var doc;
			if (value) {
				doc = JSON.parse(value);
			}
			cb(null, doc);
		},
		set: function (id, doc, cb) {
			var value = JSON.stringify(doc);
			lruCache.set(id, value);
			cb();
		},
		del: function (id, cb) {
			lruCache.del(id);
			cb();
		},
		clearAll: function (cb) {
			lruCache.reset();
			cb();
		}
	};
};