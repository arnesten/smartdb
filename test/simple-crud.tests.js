var buster = require('buster');
var sinon = require('sinon');
var testCase = buster.testCase;
var assert = buster.assert;
var refute = buster.refute;
var nock = require('nock');

module.exports = testCase('simple-crud', {
    setUp: function () {
        this.nock = nock('http://myserver.com');
    },
    tearDown: function () {
        nock.cleanAll();
    },
    'get: entity that exists': function (done) {
        this.nock
            .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1-2',
                type: 'fish'
            });
        var mapDocToEntity = sinon.spy(fishChipMapDocToEntity);
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            mapDocToEntity: mapDocToEntity
        });

        db.get('fish', 'F1', function (err, fish) {
            refute(err);
            assert.equals(fish, { _id: 'F1', _rev: '1-2', type: 'fish' });
            assert.equals(fish.constructor, Fish);
            assert.calledWith(mapDocToEntity, { _id: 'F1', _rev: '1-2', type: 'fish' });
            done();
        });
    },

    'get: if type not defined, throw exception': function (done) {
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        db.get('chip', 'C1', function (err) {
            assert(err);
            assert.equals(err.message, 'Type not defined "chip"');

            done();
        });
    },

    'get: if ID empty string, throw exception': function (done) {
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        db.get('chip', '', function (err) {
            assert(err);
            assert.equals(err.message, 'id required');

            done();
        });
    },

    'get: entity that does NOT exist should give error': function (done) {
        this.nock
            .get('/main/F1').reply(404, {
                'error': 'not_found',
                'reason': 'missing'
            });
        var mapDocToEntity = sinon.spy(fishChipMapDocToEntity);
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            mapDocToEntity: mapDocToEntity
        });

        db.get('fish', 'F1', function (err) {
            assert(err);
            done();
        });
    },

    'getOrNull: entity that exists': function (done) {
        this.nock
            .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1-2',
                type: 'fish'
            });
        var mapDocToEntity = sinon.spy(fishChipMapDocToEntity);
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            mapDocToEntity: mapDocToEntity
        });

        db.getOrNull('fish', 'F1', function (err, fish) {
            refute(err);
            assert.equals(fish, { _id: 'F1', _rev: '1-2', type: 'fish' });
            assert.equals(fish.constructor, Fish);
            assert.calledWith(mapDocToEntity, { _id: 'F1', _rev: '1-2', type: 'fish' });
            done();
        });
    },

    'getOrNull: entity that does NOT exists should give null': function (done) {
        this.nock
            .get('/main/F1').reply(404, {
                'error': 'not_found',
                'reason': 'missing'
            });
        var mapDocToEntity = sinon.spy(fishChipMapDocToEntity);
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            mapDocToEntity: mapDocToEntity
        });

        db.getOrNull('fish', 'F1', function (err, fish) {
            refute(err);
            assert.isNull(fish);
            done();
        });
    },

    'having multiple databases defined, should get from correct': function (done) {
        this.nock
            .get('/chips/C1').reply(200, {
                _id: 'C1',
                _rev: '1-2',
                type: 'chip'
            });
        var db = createDb({
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

        db.get('chip', 'C1', function (err, chip) {
            refute(err);
            assert.equals(chip, { _id: 'C1', _rev: '1-2', type: 'chip' });
            done();
        });
    },

    'saving an entity without specifying ID': function (done) {
        this.nock
            .post('/main', { name: 'Estrella', type: 'chip' }).reply(200, {
                id: 'C1',
                rev: 'C1R'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        chip: {}
                    }
                }
            ]
        });
        var estrella = new Chip({ name: 'Estrella' });

        db.save(estrella, function (err) {
            refute(err);
            assert.equals(estrella, {
                _id: 'C1',
                _rev: 'C1R',
                name: 'Estrella',
                type: 'chip'
            });
            done();
        });
    },

    'saving entity with predefined ID': function (done) {
        this.nock
            .put('/main/F1', { name: 'Bass', type: 'fish' }).reply(200, {
                id: 'F1',
                rev: 'F1R'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });
        var bass = new Fish({ _id: 'F1', name: 'Bass' });

        db.save(bass, function (err) {
            refute(err);
            assert.match(bass, {
                _id: 'F1',
                _rev: 'F1R'
            });
            done();
        });
    },

    'trying to save task with id that conflicts should give EntityConflictError': function (done) {
        this.nock
            .put('/main/F1', { name: 'Shark', type: 'fish' }).reply(409);
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });
        var shark = new Fish({ _id: 'F1', name: 'Shark' });

        db.save(shark, err => {
            assert.equals(err.name, 'EntityConflictError');
            assert.equals(err.message, 'Conflict when trying to persist entity change');
            assert.equals(err.scope, 'smartdb');
            assert.equals(err.entityId, 'F1');
            assert.equals(err.entityType, 'fish');
            assert.match(err.request, { method: 'PUT', uri: 'http://myserver.com/main/F1' });
            assert.match(err.response, { statusCode: 409, headers: { uri: 'http://myserver.com/main/F1' } });
            assert(this.nock.isDone());
            done();
        });
    },

    'updating entity': function (done) {
        this.nock
            .put('/main/F1', { _rev: 'F1R1', name: 'Shark', type: 'fish' }).reply(200, {
                id: 'F1',
                rev: 'F1R2'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });
        var shark = new Fish({ _id: 'F1', _rev: 'F1R1', name: 'Shark' });

        db.update(shark, function (err) {
            refute(err);
            assert.equals(shark._rev, 'F1R2');
            done();
        });
    },

    'trying to update entity that conflicts should give EntityConflictError': function (done) {
        this.nock
            .put('/main/F1', { _rev: 'F1R1', name: 'Shark', type: 'fish' }).reply(409);
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });
        var shark = new Fish({ _id: 'F1', _rev: 'F1R1', name: 'Shark' });

        db.update(shark, err => {
            assert.equals(err.name, 'EntityConflictError');
            assert.equals(err.entityId, 'F1');
            assert.equals(err.entityType, 'fish');
            assert(err.request);
            assert(err.response);
            assert(this.nock.isDone());
            done();
        });
    },

    'merging entity': function (done) {
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
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        var that = this;
        db.merge('fish', 'F1', { name: 'White shark', motto: 'I am bad' }, function (err, res) {
            refute(err);
            assert(that.nock.isDone());
            assert.equals(res, { rev: 'F1R2' });
            done();
        });
    },

    'trying to merge entity that conflicts should give EntityConflictError': function (done) {
        this.nock
            .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1',
                name: 'Shark',
                type: 'fish'
            })
            .put('/main/F1', { _rev: 'F1R1', name: 'White shark', type: 'fish' }).reply(409);
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        db.merge('fish', 'F1', { name: 'White shark' }, err => {
            assert.equals(err.name, 'EntityConflictError');
            assert.equals(err.entityId, 'F1');
            assert.equals(err.entityType, 'fish');
            assert(err.request);
            assert(err.response);
            assert(this.nock.isDone());
            done();
        });
    },

    'trying to merge entity that no longer exists should give EntityMissingError': function (done) {
        this.nock
            .get('/main/F1').reply(404);
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        db.merge('fish', 'F1', { name: 'White shark' }, err => {
            assert.equals(err.name, 'EntityMissingError');
            assert.equals(err.entityId, 'F1');
            assert.equals(err.entityType, 'fish');
            assert(err.request);
            assert(err.response);
            assert(this.nock.isDone());
            done();
        });
    },

    'removing entity': function (done) {
        this.nock
            .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1'
            })
            .delete('/main/F1?rev=F1R1').reply(200, {});
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        var that = this;
        db.remove('fish', 'F1', function (err) {
            refute(err);
            assert(that.nock.isDone());
            done();
        })
    },

    'trying to remove entity that conflicts should give EntityConflictError': function (done) {
        this.nock
            .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1'
            })
            .delete('/main/F1?rev=F1R1').reply(409);
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        db.remove('fish', 'F1', err => {
            assert.equals(err.name, 'EntityConflictError');
            assert.equals(err.entityId, 'F1');
            assert.equals(err.entityType, 'fish');
            assert(err.request);
            assert(err.response);
            assert(this.nock.isDone());
            done();
        });
    }
});

function fishChipMapDocToEntity(doc) {
    var type = doc.type;
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

function createDb(options) {
    return require('../lib/smartdb.js')(options);
}