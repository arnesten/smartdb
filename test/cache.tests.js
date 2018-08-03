let bocha = require('bocha');
let sinon = require('sinon');
let testCase = bocha.testCase;
let assert = bocha.assert;
let nock = require('nock');
let SmartDb = require('../lib/smartdb.js');

module.exports = testCase('cache', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'getting entity twice with cacheMaxSize set, should get from cache': async function () {
        this.nock
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
        let db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: { cacheMaxSize: 1 }
                    }
                }
            ]
        });

        let fish1 = await db.get('fish', 'F1');
        assert.equals(fish1, { _id: 'F1', _rev: 'F1R1', type: 'fish' });

        let fish2 = await db.get('fish', 'F1');
        assert.equals(fish2, { _id: 'F1', _rev: 'F1R1', type: 'fish' });
    },

    'getting entity twice without cache set, should NOT get from cache': async function () {
        this.nock
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
        let db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        let fish = await db.get('fish', 'F1');
        assert.equals(fish, { _id: 'F1', _rev: 'F1R1', type: 'fish' });

        let fish2 = await db.get('fish', 'F1');
        assert.equals(fish2, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
    },

    'getting first cached entity after cache size exceeded, should NOT get from cache': async function () {
        this.nock
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
            .get('/animals/F2').reply(200, { _id: 'F2', _rev: 'F2R1', type: 'fish' })
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
        let db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: { cacheMaxSize: 1 }
                    }
                }
            ]
        });

        let fish1 = await db.get('fish', 'F1');
        assert.equals(fish1, { _id: 'F1', _rev: 'F1R1', type: 'fish' });
        let fish2 = await db.get('fish', 'F2');
        assert.equals(fish2, { _id: 'F2', _rev: 'F2R1', type: 'fish' });
        let fish3 = await db.get('fish', 'F1');
        assert.equals(fish3, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
    },
    'cacheMaxAge set': {
        setUp() {
            this.clock = sinon.useFakeTimers();
        },
        tearDown() {
            this.clock.restore();
        },
        'and getting entity twice within age limit should get from cache': async function () {
            this.nock
                .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
                .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
            let db = createDb({
                databases: [
                    {
                        url: 'http://myserver.com/animals',
                        entities: {
                            fish: { cacheMaxAge: 2000 }
                        }
                    }
                ]
            });

            let fish = await db.get('fish', 'F1');
            assert.equals(fish, { _id: 'F1', _rev: 'F1R1', type: 'fish' });

            this.clock.tick(1999);

            let fish2 = await db.get('fish', 'F1');
            assert.equals(fish2, { _id: 'F1', _rev: 'F1R1', type: 'fish' });
        },
        'and getting entity twice outside age limit should NOT get from cache': async function () {
            this.nock
                .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
                .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
            let db = createDb({
                databases: [
                    {
                        url: 'http://myserver.com/animals',
                        entities: {
                            fish: { cacheMaxAge: 2000 }
                        }
                    }
                ]
            });

            let fish = await db.get('fish', 'F1');
            assert.equals(fish, { _id: 'F1', _rev: 'F1R1', type: 'fish' });

            this.clock.tick(2001);

            let fish2 = await db.get('fish', 'F1');
            assert.equals(fish2, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
        }
    },
    'updating task should update cache': async function () {
        this.nock
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
            .put('/animals/F1', { _rev: 'F1R1', type: 'fish' }).reply(200, { id: 'F1', rev: 'F1R2' })
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R3', type: 'fish' });
        let db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: { cacheMaxSize: 10 }
                    }
                }
            ]
        });
        let fish = await db.get('fish', 'F1');

        await db.update(fish);

        let fish2 = await db.get('fish', 'F1');
        assert.equals(fish2, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
    },
    'merging task should update cache': async function () {
        this.nock
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
            .put('/animals/F1', { _rev: 'F1R1', type: 'fish', name: 'Sharky' }).reply(200, { id: 'F1', rev: 'F1R2' });
        let db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: { cacheMaxSize: 10 }
                    }
                }
            ]
        });
        await db.get('fish', 'F1');

        await db.merge('fish', 'F1', { name: 'Sharky' });

        let fish2 = await db.get('fish', 'F1');
        assert.equals(fish2, { _id: 'F1', _rev: 'F1R2', type: 'fish', name: 'Sharky' });
    },
    'removing task should clear it from cache': async function () {
        this.nock
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
            .delete('/animals/F1?rev=F1R1').reply(200)
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
        let db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: { cacheMaxSize: 10 }
                    }
                }
            ]
        });
        await db.get('fish', 'F1');

        await db.remove('fish', 'F1');

        let fish2 = await db.get('fish', 'F1');
        assert.equals(fish2, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
    }
});

function createDb(options) {
    return SmartDb(options);
}