
module.exports.create = function () {
	return {
		get: function (id, cb) {
			cb();
		},
		set: function (id, value, cb) {
			cb()
		},
		del: function (id, cb) {
			cb();
		},
		clearAll: function (cb) {
			cb();
		},
		isNullCache: true
	};
};