var _ = require('underscore');
var buster = require('buster');
var sinon = require('sinon');
var testCase = buster.testCase;
var assert = buster.assertions.assert;
var refute = buster.assertions.refute;
var nock = require('nock');

module.exports = testCase('cache-provider', {
	setUp: function () {
		this.nock = nock('http://myserver.com');
	},
	tearDown: function () {
		nock.cleanAll();
	},
	'can use provider to get cached item': function (done) {
		var smartDb = createDb({
			databases: [
				{
					url: 'http://myserver.com/animals',
					entities: {
						fish: {
							cacheMaxSize: 1
						}
					}
				}
			],
			cacheProvider: {
				getCache: function (entityType, settings) {
					assert.equals(entityType, 'fish');
					assert.equals(settings, { cacheMaxSize: 1 });
					return {
						get: function (id, cb) {
							assert.equals(id, 'F1');
							cb(null, { name: 'Shark', type: 'fish' });
						}
					};
				}
			}
		});

		smartDb.get('fish', 'F1', function (err, doc) {
			refute(err);
			assert.equals(doc, { name: 'Shark', type: 'fish' });
			done();
		});
	}
});

function createDb(options) {
	return require('../lib/smartDb')(options);
}