import SmartDb from '../lib/SmartDb.js';
import { assert, testCase, catchErrorAsync, sinon } from 'bocha';
import nock from 'nock';

export default testCase('simple-crud', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'get': {
        'entity that exists': async function () {
            this.nock
                .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1-2',
                type: 'fish'
            });
            let mapDocToEntity = sinon.spy(fishChipMapDocToEntity);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ],
                mapDocToEntity
            });

            let fish = await db.get('fish', 'F1');

            assert.equals(fish, { _id: 'F1', _rev: '1-2', type: 'fish' });
            assert.equals(fish.constructor, Fish);
            assert.calledWith(mapDocToEntity, { _id: 'F1', _rev: '1-2', type: 'fish' });
        },
        'entity of other type exists': async function () {
            this.nock
                .get('/main/X').reply(200, {
                _id: 'X',
                _rev: '1-2',
                type: 'fish'
            });
            let mapDocToEntity = sinon.spy(fishChipMapDocToEntity);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {},
                            chip: {}
                        }
                    }
                ],
                mapDocToEntity
            });

            let err = await catchErrorAsync(() => db.get('chip', 'X'));

            assert.equals(err.message, 'Entity is missing');
        },
        'if type not defined, throw exception': async function () {
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });

            let err = await catchErrorAsync(() => db.get('chip', 'C1'));

            assert.equals(err.message, 'Type not defined "chip"');
        },
        'if ID empty string, throw exception': async function () {
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });

            let err = await catchErrorAsync(() => db.get('chip', ''));

            assert.equals(err.message, 'id required');
        },
        'entity that does NOT exist should give error': async function () {
            this.nock
                .get('/main/F1').reply(404, {
                'error': 'not_found',
                'reason': 'missing'
            });
            let mapDocToEntity = sinon.spy(fishChipMapDocToEntity);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ],
                mapDocToEntity
            });

            let err = await catchErrorAsync(() => db.get('fish', 'F1'));

            assert(err);
        },
        'having multiple databases defined, should get from correct': async function () {
            this.nock
                .get('/chips/C1').reply(200, {
                _id: 'C1',
                _rev: '1-2',
                type: 'chip'
            });
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    },
                    {
                        url: 'http://myserver.com/chips',
                        entities: {
                            chip: {}
                        }
                    }
                ],
                mapDocToEntity: fishChipMapDocToEntity
            });

            let chip = await db.get('chip', 'C1');

            assert.equals(chip, { _id: 'C1', _rev: '1-2', type: 'chip' });
        },
    },
    'getOrNull': {
        'entity that exists': async function () {
            this.nock
                .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1-2',
                type: 'fish'
            });
            let mapDocToEntity = sinon.spy(fishChipMapDocToEntity);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ],
                mapDocToEntity
            });

            let fish = await db.getOrNull('fish', 'F1');

            assert.equals(fish, { _id: 'F1', _rev: '1-2', type: 'fish' });
            assert.equals(fish.constructor, Fish);
            assert.calledWith(mapDocToEntity, { _id: 'F1', _rev: '1-2', type: 'fish' });
        },
        'entity of other type exists': async function () {
            this.nock
                .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1-2',
                type: 'fish'
            });
            let mapDocToEntity = sinon.spy(fishChipMapDocToEntity);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {},
                            chip: {}
                        }
                    }
                ],
                mapDocToEntity
            });

            let chip = await db.getOrNull('chip', 'F1');

            assert.isNull(chip);
        },
        'entity that does NOT exists should give null': async function () {
            this.nock
                .get('/main/F1').reply(404, {
                'error': 'not_found',
                'reason': 'missing'
            });
            let mapDocToEntity = sinon.spy(fishChipMapDocToEntity);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ],
                mapDocToEntity
            });

            let fish = await db.getOrNull('fish', 'F1');

            assert.isNull(fish);
        },
    },
    'save': {
        'saving an entity without specifying ID': async function () {
            this.nock
                .post('/main', { name: 'Estrella', type: 'chip' }).reply(200, {
                id: 'C1',
                rev: 'C1R'
            });
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            chip: {}
                        }
                    }
                ]
            });
            let estrella = new Chip({ name: 'Estrella' });

            await db.save(estrella);

            assert.equals(estrella, {
                _id: 'C1',
                _rev: 'C1R',
                name: 'Estrella',
                type: 'chip'
            });
        },
        'without callback returns promise': async function () {
            this.nock
                .post('/main', { name: 'Estrella', type: 'chip' }).reply(200, {
                id: 'C1',
                rev: 'C1R'
            });
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            chip: {}
                        }
                    }
                ]
            });
            let estrella = new Chip({ name: 'Estrella' });

            await db.save(estrella);

            assert.equals(estrella, {
                _id: 'C1',
                _rev: 'C1R',
                name: 'Estrella',
                type: 'chip'
            });
        },
        'saving entity with predefined ID': async function () {
            this.nock
                .put('/main/F1', { name: 'Bass', type: 'fish' }).reply(200, {
                id: 'F1',
                rev: 'F1R'
            });
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });
            let bass = new Fish({ _id: 'F1', name: 'Bass' });

            await db.save(bass);

            assert.match(bass, {
                _id: 'F1',
                _rev: 'F1R'
            });
        },
        'trying to save task with id that conflicts should give EntityConflictError': async function () {
            this.nock
                .put('/main/F1', { name: 'Shark', type: 'fish' }).reply(409);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });
            let shark = new Fish({ _id: 'F1', name: 'Shark' });

            let err = await catchErrorAsync(() => db.save(shark));

            assert.equals(err.name, 'EntityConflictError');
            assert.equals(err.message, 'Conflict when trying to persist entity change');
            assert.equals(err.scope, 'smartdb');
            assert.equals(err.entityId, 'F1');
            assert.equals(err.entityType, 'fish');
            assert.match(err.request, { method: 'put', url: 'http://myserver.com/main/F1' });
            assert.match(err.response, { statusCode: 409, headers: { uri: 'http://myserver.com/main/F1' } });
            assert(this.nock.isDone());
        },
    },
    'update': {
        'updating entity': async function () {
            this.nock
                .put('/main/F1', { _rev: 'F1R1', name: 'Shark', type: 'fish' }).reply(200, {
                id: 'F1',
                rev: 'F1R2'
            });
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });
            let shark = new Fish({ _id: 'F1', _rev: 'F1R1', name: 'Shark' });

            await db.update(shark);

            assert.equals(shark._rev, 'F1R2');
        },
        'trying to update entity that conflicts should give EntityConflictError': async function () {
            this.nock
                .put('/main/F1', { _rev: 'F1R1', name: 'Shark', type: 'fish' }).reply(409);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });
            let shark = new Fish({ _id: 'F1', _rev: 'F1R1', name: 'Shark' });

            let err = await catchErrorAsync(() => db.update(shark));

            assert.equals(err.name, 'EntityConflictError');
            assert.equals(err.entityId, 'F1');
            assert.equals(err.entityType, 'fish');
            assert(err.request);
            assert(err.response);
            assert(this.nock.isDone());
        },
    },
    'updateWithRetry': {
        'can update task': async function () {
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1',
                type: 'fish'
            });
            this.nock.put('/main/F1', {
                _rev: '1',
                type: 'fish',
                name: 'Mr White'
            }).reply(200, { id: 'F1', rev: '2' });
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });

            let updatedFish = await db.updateWithRetry('fish', 'F1', fish => {
                fish.name = 'Mr White';
            });

            assert.equals(updatedFish.name, 'Mr White');
            assert.equals(updatedFish._rev, '2');
        },
        'can return promise in update method': async function () {
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1',
                type: 'fish'
            });
            this.nock.put('/main/F1', {
                _rev: '1',
                type: 'fish',
                name: 'Mr White'
            }).reply(200, { id: 'F1', rev: '2' });
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });

            let updatedFish = await db.updateWithRetry('fish', 'F1', fish => {
                return new Promise(resolve => {
                    setTimeout(() => {
                        fish.name = 'Mr White';
                        resolve();
                    }, 10);
                });
            });

            assert.equals(updatedFish.name, 'Mr White');
            assert.equals(updatedFish._rev, '2');
        },
        'when entity does NOT exist should NOT retry': async function () {
            this.nock.get('/main/F1').reply(404);
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1',
                type: 'fish'
            });
            this.nock.put('/main/F1', {
                _rev: '1',
                type: 'fish',
                name: 'Mr White'
            }).reply(200, { id: 'F1', rev: '3' });
            let db = SmartDb({
                databases: [{
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }]
            });

            let err = await catchErrorAsync(() => db.updateWithRetry('fish', 'F1', fish => {
                fish.name = 'Mr White';
            }));

            assert(err);
            assert.equals(err.name, 'EntityMissingError');
        },
        'when first attempt fails should retry': async function () {
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1',
                type: 'fish'
            });
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '2',
                type: 'fish'
            });
            this.nock.put('/main/F1', {
                _rev: '1',
                type: 'fish',
                name: 'Mr White'
            }).reply(500);
            this.nock.put('/main/F1', {
                _rev: '2',
                type: 'fish',
                name: 'Mr White'
            }).reply(200, { id: 'F1', rev: '3' });
            let db = SmartDb({
                databases: [{
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }]
            });

            let updatedFish = await db.updateWithRetry('fish', 'F1', fish => {
                fish.name = 'Mr White';
            });

            assert.equals(updatedFish.name, 'Mr White');
            assert.equals(updatedFish._rev, '3');
        },
        'when second attempt fails should retry': async function () {
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1',
                type: 'fish'
            });
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '2',
                type: 'fish'
            });
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '3',
                type: 'fish'
            });
            this.nock.put('/main/F1', {
                _rev: '1',
                type: 'fish',
                name: 'Mr White'
            }).reply(500);
            this.nock.put('/main/F1', {
                _rev: '2',
                type: 'fish',
                name: 'Mr White'
            }).reply(500);
            this.nock.put('/main/F1', {
                _rev: '3',
                type: 'fish',
                name: 'Mr White'
            }).reply(200, { id: 'F1', rev: '4' });
            let db = SmartDb({
                databases: [{
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }]
            });

            let updatedFish = await db.updateWithRetry('fish', 'F1', fish => {
                fish.name = 'Mr White';
            });

            assert.equals(updatedFish.name, 'Mr White');
            assert.equals(updatedFish._rev, '4');
        },
        'when third attempt fails should fail': async function () {
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1',
                type: 'fish'
            });
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '2',
                type: 'fish'
            });
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '3',
                type: 'fish'
            });
            this.nock.put('/main/F1', {
                _rev: '1',
                type: 'fish',
                name: 'Mr White'
            }).reply(500);
            this.nock.put('/main/F1', {
                _rev: '2',
                type: 'fish',
                name: 'Mr White'
            }).reply(500);
            this.nock.put('/main/F1', {
                _rev: '3',
                type: 'fish',
                name: 'Mr White'
            }).reply(500);
            let db = SmartDb({
                databases: [{
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }]
            });

            let err = await catchErrorAsync(() => db.updateWithRetry('fish', 'F1', fish => {
                fish.name = 'Mr White';
            }));

            assert(err);
            assert.equals(err.statusCode, 500);
        },
        'when return false in update method should NOT make PUT call': async function () {
            this.nock.get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1',
                type: 'fish'
            });
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });

            let updatedFish = await db.updateWithRetry('fish', 'F1', () => {
                return false;
            });

            assert.equals(updatedFish._id, 'F1');
            assert.equals(updatedFish._rev, '1');
        },
    },
    'merge': {
        'merging entity': async function () {
            this.nock
                .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1',
                name: 'Shark',
                type: 'fish'
            })
                .put('/main/F1', { _rev: 'F1R1', name: 'White shark', type: 'fish', motto: 'I am bad' }).reply(200, {
                rev: 'F1R2'
            });
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });

            let res = await db.merge('fish', 'F1', { name: 'White shark', motto: 'I am bad' });

            assert(this.nock.isDone());
            assert.equals(res, { rev: 'F1R2' });
        },
        'trying to merge entity that conflicts should give EntityConflictError': async function () {
            this.nock
                .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1',
                name: 'Shark',
                type: 'fish'
            })
                .put('/main/F1', { _rev: 'F1R1', name: 'White shark', type: 'fish' }).reply(409);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });

            let err = await catchErrorAsync(() => db.merge('fish', 'F1', { name: 'White shark' }));

            assert.equals(err.name, 'EntityConflictError');
            assert.equals(err.entityId, 'F1');
            assert.equals(err.entityType, 'fish');
            assert(err.request);
            assert(err.response);
            assert(this.nock.isDone());
        },
        'trying to merge entity that no longer exists should give EntityMissingError': async function () {
            this.nock
                .get('/main/F1').reply(404);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });

            let err = await catchErrorAsync(() => db.merge('fish', 'F1', { name: 'White shark' }));

            assert.equals(err.name, 'EntityMissingError');
            assert.equals(err.entityId, 'F1');
            assert.equals(err.entityType, 'fish');
            assert(err.request);
            assert(err.response);
            assert(this.nock.isDone());
        },
    },
    'remove': {
        'removing entity': async function () {
            this.nock
                .get('/main/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
                .delete('/main/F1?rev=F1R1').reply(200, {});
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });

            await db.remove('fish', 'F1');

            assert(this.nock.isDone());
        },
        'trying to remove entity that conflicts should give EntityConflictError': async function () {
            this.nock
                .get('/main/F1').reply(200, { _id: 'F1', _rev: 'F1R1', type: 'fish' })
                .delete('/main/F1?rev=F1R1').reply(409);
            let db = SmartDb({
                databases: [
                    {
                        url: 'http://myserver.com/main',
                        entities: {
                            fish: {}
                        }
                    }
                ]
            });

            let err = await catchErrorAsync(() => db.remove('fish', 'F1'));

            assert.equals(err.name, 'EntityConflictError');
            assert.equals(err.entityId, 'F1');
            assert.equals(err.entityType, 'fish');
            assert(err.request);
            assert(err.response);
            assert(this.nock.isDone());
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