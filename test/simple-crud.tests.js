var _ = require('underscore');
var buster = require('buster');
var sinon = require('sinon');
var testCase = buster.testCase;
var assert = buster.assertions.assert;
var refute = buster.assertions.refute;
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
                _rev: '1-2'
            });
        var entityCreatorStub = sinon.spy(fishChipCreator);
        var smartDb = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            getEntityCreator: entityCreatorStub
        });

        smartDb.get('fish', 'F1', function (err, fish) {
            refute(err);
            assert.equals(fish, { _id: 'F1', _rev: '1-2', type: 'fish' });
            assert.equals(fish.constructor, Fish);
            assert.calledWith(entityCreatorStub, 'fish');
            done();
        });
    },

    'get: entity that does NOT exist should give error': function (done) {
        this.nock
            .get('/main/F1').reply(404, {
                'error': 'not_found',
                'reason': 'missing'
            });
        var entityCreatorStub = sinon.spy(fishChipCreator);
        var smartDb = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            getEntityCreator: entityCreatorStub
        });

        smartDb.get('fish', 'F1', function (err) {
            assert(err);
            done();
        });
    },

    'getOrNull: entity that exists': function (done) {
        this.nock
            .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: '1-2'
            });
        var entityCreatorStub = sinon.spy(fishChipCreator);
        var smartDb = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            getEntityCreator: entityCreatorStub
        });

        smartDb.getOrNull('fish', 'F1', function (err, fish) {
            refute(err);
            assert.equals(fish, { _id: 'F1', _rev: '1-2', type: 'fish' });
            assert.equals(fish.constructor, Fish);
            assert.calledWith(entityCreatorStub, 'fish');
            done();
        });
    },

    'getOrNull: entity that does NOT exists should give null': function (done) {
        this.nock
            .get('/main/F1').reply(404, {
                'error': 'not_found',
                'reason': 'missing'
            });
        var entityCreatorStub = sinon.spy(fishChipCreator);
        var smartDb = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            getEntityCreator: entityCreatorStub
        });

        smartDb.getOrNull('fish', 'F1', function (err, fish) {
            refute(err);
            assert.isNull(fish);
            done();
        });
    },

    'having multiple databases defined, should get from correct': function (done) {
        this.nock
            .get('/chips/C1').reply(200, {
                _id: 'C1',
                _rev: '1-2'
            });
        var smartDb = createDb({
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
            getEntityCreator: fishChipCreator
        });

        smartDb.get('chip', 'C1', function (err, chip) {
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
        var smartDb = createDb({
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

        smartDb.save(estrella, function (err) {
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
        var smartDb = createDb({
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

        smartDb.save(bass, function (err) {
            refute(err);
            assert.match(bass, {
                _id: 'F1',
                _rev: 'F1R'
            });
            done();
        });
    },

    'updating entity': function (done) {
        this.nock
            .put('/main/F1', { _rev: 'F1R1', name: 'Shark', type: 'fish' }).reply(200, {
                id: 'F1',
                rev: 'F1R2'
            });
        var smartDb = createDb({
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

        smartDb.update(shark, function (err) {
            refute(err);
            assert.equals(shark._rev, 'F1R2');
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
        var smartDb = createDb({
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
        smartDb.merge('fish', 'F1', { name: 'White shark', motto: 'I am bad' }, function (err, res) {
            refute(err);
            assert(that.nock.isDone());
            assert.equals(res, { rev: 'F1R2' });
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
        var smartDb = createDb({
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
        smartDb.remove('fish', 'F1', function (err) {
            refute(err);
            assert(that.nock.isDone());
            done();
        })
    }
});

function fishChipCreator(type) {
    return function (doc) {
        if (type === 'fish') return new Fish(doc);
        if (type === 'chip') return new Chip(doc);
        throw new Error();
    };
}

function Fish(doc) {
    _.extend(this, doc);
    this.type = 'fish';
}

function Chip(doc) {
    _.extend(this, doc);
    this.type = 'chip';
}

function createDb(options) {
    return require('../lib/smartDb')(options);
}