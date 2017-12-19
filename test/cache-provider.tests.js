let bocha = require('bocha');
let sinon = require('sinon');
let testCase = bocha.testCase;
let assert = bocha.assert;
let refute = bocha.refute;
let nock = require('nock');

module.exports = testCase('cache-provider', {
	setUp() {
		this.nock = nock('http://myserver.com');
	},
	tearDown() {
		nock.cleanAll();
	},
	'can use provider to get cached item': function (done) {
		let db = createDb({
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
				create: function (entityType, settings) {
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

		db.get('fish', 'F1', function (err, doc) {
			refute(err);
			assert.equals(doc, { name: 'Shark', type: 'fish' });
			done();
		});
	},
	'should delete from cache when update': function (done) {
		this.nock
			.put('/animals/F1', { _rev: 'F1R1', name: 'Shark', type: 'fish' }).reply(200, {
				rev: 'F1R2'
			});
		let cacheDel = sinon.stub().callsArg(1);
		let db = createDb({
			databases: [
				{
					url: 'http://myserver.com/animals',
					entities: {
						fish: { }
					}
				}
			],
			cacheProvider: {
				create: function () {
					return {
						del: cacheDel
					};
				}
			}
		});
		let entity = { _id: 'F1', _rev: 'F1R1', name: 'Shark', type: 'fish' };
		db.update(entity, function (err) {
			refute(err);
			assert.calledOnce(cacheDel);
			assert.calledWith(cacheDel, 'F1');
			assert.equals(entity._rev, 'F1R2');
			done();
		});
	}
});

function createDb(options) {
	return require('../lib/smartdb.js')(options);
}