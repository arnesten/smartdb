import { assert, testCase } from 'bocha';
import nock from 'nock';
import SmartDb from '../lib/SmartDb.js';

export default testCase('auth', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'getBulk': {
        'two entities that exist': async function () {
            this.nock
                .post('/main/_all_docs', { keys: ['F1', 'F2'] })
                .query({ include_docs: 'true' })
                .reply(200, {
                    rows: [
                        { doc: { _id: 'F1', type: 'fish' } },
                        { doc: { _id: 'F2', type: 'fish' } }
                    ]
                });
            let db = SmartDb({
                databases: [{
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }],
                mapDocToEntity: fishChipMapDocToEntity
            });

            let fishes = await db.getBulk('fish', ['F1', 'F2']);

            assert.equals(fishes.length, 2);
            assert.equals(fishes[0], { _id: 'F1', type: 'fish' });
            assert.equals(fishes[0].constructor, Fish);
            assert.equals(fishes[1], { _id: 'F2', type: 'fish' });
            assert.equals(fishes[1].constructor, Fish);
        },
        'one entity that exists and one that does NOT exist': async function () {
            this.nock
                .post('/main/_all_docs', { keys: ['F1', 'F2'] })
                .query({ include_docs: 'true' })
                .reply(200, {
                    rows: [
                        { doc: { _id: 'F1', type: 'fish' } },
                        {}
                    ]
                });
            let db = SmartDb({
                databases: [{
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }],
                mapDocToEntity: fishChipMapDocToEntity
            });

            let error = await catchError(() => db.getBulk('fish', ['F1', 'F2']));

            assert.equals(error.name, 'EntityMissingError');
            assert.equals(error.entityIds, ['F2']);
            assert.equals(error.entityType, 'fish');
        },
        'two entities that does NOT exist': async function () {
            this.nock
                .post('/main/_all_docs', { keys: ['F1', 'F2'] })
                .query({ include_docs: 'true' })
                .reply(200, {
                    rows: [
                        {},
                        {}
                    ]
                });
            let db = SmartDb({
                databases: [{
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }],
                mapDocToEntity: fishChipMapDocToEntity
            });

            let error = await catchError(() => db.getBulk('fish', ['F1', 'F2']));

            assert.equals(error.name, 'EntityMissingError');
            assert.equals(error.entityIds, ['F1', 'F2']);
            assert.equals(error.entityType, 'fish');
        }
    },
    'getBulkOrNull': {
        'one entity that exists and one that does NOT exist': async function () {
            this.nock
                .post('/main/_all_docs', { keys: ['F1', 'F2'] })
                .query({ include_docs: 'true' })
                .reply(200, {
                    rows: [
                        { doc: { _id: 'F1', type: 'fish' } },
                        {}
                    ]
                });
            let db = SmartDb({
                databases: [{
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }],
                mapDocToEntity: fishChipMapDocToEntity
            });

            let fishes = await db.getOrNullBulk('fish', ['F1', 'F2']);

            assert.equals(fishes.length, 2);
            assert.equals(fishes[0], { _id: 'F1', type: 'fish' });
            assert.equals(fishes[0].constructor, Fish);
            assert.equals(fishes[1], null);
        },
        'two entities where one is of wrong type': async function () {
            this.nock
                .post('/main/_all_docs', { keys: ['F1', 'F2'] })
                .query({ include_docs: 'true' })
                .reply(200, {
                    rows: [
                        { doc: { _id: 'F1', type: 'chip' } },
                        { doc: { _id: 'F2', type: 'fish' }}
                    ]
                });
            let db = SmartDb({
                databases: [{
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {},
                        chip: {}
                    }
                }],
                mapDocToEntity: fishChipMapDocToEntity
            });

            let fishes = await db.getOrNullBulk('fish', ['F1', 'F2']);

            assert.equals(fishes.length, 2);
            assert.equals(fishes[0], null);
            assert.equals(fishes[1], { _id: 'F2', type: 'fish' });
            assert.equals(fishes[1].constructor, Fish);
        }
    }
});

function fishChipMapDocToEntity(doc) {
    let type = doc.type;
    if (type === 'fish') return new Fish(doc);
    if (type === 'chip') return new Chip(doc);

    throw new Error();
}

function Fish(doc) {
    Object.assign(this, doc);
    this.type = 'fish';
}

function Chip(doc) {
    Object.assign(this, doc);
    this.type = 'chip';
}

async function catchError(fn) {
    try {
        await fn();
    }
    catch (err) {
        return err;
    }
}