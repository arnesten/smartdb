import { assert, testCase, sinon } from 'bocha/node.mjs';
import nock from 'nock';
import SmartDb from '../lib/SmartDb.js';

export default testCase('cache', {
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
        let db = SmartDb({
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
        let db = SmartDb({
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
        let db = SmartDb({
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
            let db = SmartDb({
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
            let db = SmartDb({
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
        let db = SmartDb({
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
        let db = SmartDb({
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
        let db = SmartDb({
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
    },
    'removeCacheOnly will only remove from cache and not send DELETE': async function () {
        this.nock
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
            .get('/animals/F1').reply(200, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
        let db = SmartDb({
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

        await db.removeCacheOnly('fish', 'F1');

        let fish2 = await db.get('fish', 'F1');
        assert.equals(fish2, { _id: 'F1', _rev: 'F1R2', type: 'fish' });
    },
    'getBulk: two items in cache': async function () {
        this.nock
            .post('/main/_all_docs', { keys: ['F1', 'F2'] })
            .query({ include_docs: 'true' })
            .reply(200, {
                rows: [
                    { doc: { _id: 'F1', type: 'fish' } },
                    { doc: { _id: 'F2', type: 'fish' } }
                ]
            })
            .post('/main/_all_docs', { keys: ['F1', 'F2'] })
            .query({ include_docs: 'true' })
            .reply(500);
        let db = SmartDb({
            databases: [{
                url: 'http://myserver.com/main',
                entities: {
                    fish: { cacheMaxSize: 2 }
                }
            }]
        });

        await db.getBulk('fish', ['F1', 'F2']);
        let fishes = await db.getBulk('fish', ['F1', 'F2']);

        assert.equals(fishes.length, 2);
        assert.equals(fishes[0], { _id: 'F1', type: 'fish' });
        assert.equals(fishes[1], { _id: 'F2', type: 'fish' });
    }
});