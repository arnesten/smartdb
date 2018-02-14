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
				create(entityType, settings) {
					assert.equals(entityType, 'fish');
					assert.equals(settings, { cacheMaxSize: 1 });
					return {
						get(id) {
							assert.equals(id, 'F1');
							return Promise.resolve({ name: 'Shark', type: 'fish' });
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
	'should delete from cache when update': async function () {
		this.nock
			.put('/animals/F1', { _rev: 'F1R1', name: 'Shark', type: 'fish' }).reply(200, {
				rev: 'F1R2'
			});
		let cacheDel = sinon.spy(() => Promise.resolve());
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
				create() {
					return {
					    set: () => Promise.resolve(),
						del: cacheDel
					};
				}
			}
		});
		let entity = { _id: 'F1', _rev: 'F1R1', name: 'Shark', type: 'fish' };
		await db.update(entity);
        assert.calledOnce(cacheDel);
        assert.calledWith(cacheDel, 'F1');
        assert.equals(entity._rev, 'F1R2');
	}
});

function createDb(options) {
	return require('../lib/smartdb.js')(options);
}