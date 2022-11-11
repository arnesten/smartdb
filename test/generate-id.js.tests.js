import { assert, testCase } from 'bocha/node.mjs';
import nock from 'nock';
import SmartDb from '../lib/SmartDb.js';

export default testCase('generate-id', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'can generate ID on save': async function () {
        this.nock.put('/main/S1A', { name: 'Shark', type: 'fish' }).reply(200, {
            id: 'S1A',
            rev: 'S1B'
        });
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            generateId(doc) {
                assert.equals(doc, { name: 'Shark', type: 'fish' });
                return Promise.resolve('S1A');
            }
        });

        let fish = { name: 'Shark', type: 'fish' };

        await db.save(fish);

        assert.equals(fish, {
            _id: 'S1A',
            _rev: 'S1B',
            name: 'Shark',
            type: 'fish'
        });
    },
    'when conflict happens after generating ID on save should try with new ID': async function () {
        this.nock
            .put('/main/S1A', { name: 'Shark', type: 'fish' }).reply(409, {})
            .put('/main/S2A', { name: 'Shark', type: 'fish' }).reply(200, { id: 'S2A', rev: 'S2B' });
        let callCount = 0;
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            generateId(doc) {
                callCount++;
                assert.equals(doc, { name: 'Shark', type: 'fish' });
                return Promise.resolve(`S${callCount}A`);
            }
        });

        let fish = { name: 'Shark', type: 'fish' };

        await db.save(fish);

        assert.equals(fish, {
            _id: 'S2A',
            _rev: 'S2B',
            name: 'Shark',
            type: 'fish'
        });
    },
    'when conflict happens twice after generating ID on save should try with new ID': async function () {
        this.nock
            .put('/main/S1A', { name: 'Shark', type: 'fish' }).reply(409, {})
            .put('/main/S2A', { name: 'Shark', type: 'fish' }).reply(409, {})
            .put('/main/S3A', { name: 'Shark', type: 'fish' }).reply(200, { id: 'S3A', rev: 'S3B' });
        let callCount = 0;
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            generateId(doc) {
                callCount++;
                assert.equals(doc, { name: 'Shark', type: 'fish' });
                return Promise.resolve(`S${callCount}A`);
            }
        });

        let fish = { name: 'Shark', type: 'fish' };

        await db.save(fish);

        assert.equals(fish, {
            _id: 'S3A',
            _rev: 'S3B',
            name: 'Shark',
            type: 'fish'
        });
    }
});