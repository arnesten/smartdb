var _ = require('underscore');
var buster = require('buster');
var sinon = require('sinon');
var testCase = buster.testCase;
var assert = buster.assertions.assert;
var refute = buster.assertions.refute;
var nock = require('nock');

module.exports = testCase('event-hooks', {
    setUp: function () {
        this.nock = nock('http://myserver.com');
    },
    tearDown: function () {
        nock.cleanAll();
    },
    'preInsert: can manipulate doc before merge': function (done) {
        this.nock
            .get('/main/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R',
                type: 'fish'
            })
            .put('/main/F1', {
                _rev: 'F1R',
                type: 'fish',
                prop1: 'a',
                prop2: 'b'
            }).reply(200, { rev: 'F2R' });
        var preInsertStub = sinon.spy(function (event, callback) {
            assert.equals(event.doc, {
                _rev: 'F1R',
                prop1: 'a',
                type: 'fish'
            });
            assert.equals(event.type, 'preInsert');
            assert.equals(event.operation, 'merge');
            assert.equals(event.mergeArgs, {
                type: 'fish',
                id: 'F1',
                changedProperties: { prop1: 'a' }
            });

            event.doc.prop2 = 'b';

            callback();
        });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    },
                    eventHooks: {
                        preInsert: preInsertStub
                    }
                }
            ]
        });

        var that = this;
        db.merge('fish', 'F1', { prop1: 'a' }, function (err, res) {
            refute(err);
            assert.equals(res, { rev: 'F2R' });
            assert.calledOnce(preInsertStub);
            assert(that.nock.isDone());
            done();
        });
    },
    'preInsert: can manipulate doc before save': function (done) {
        this.nock
            .post('/main', {
                type: 'fish',
                prop1: 'a',
                prop2: 'b'
            }).reply(200, { id: 'F1', rev: 'F2R' });
        var preInsertStub = sinon.spy(function (event, callback) {
            assert.equals(event.doc, {
                prop1: 'a',
                type: 'fish'
            });
            assert.equals(event.type, 'preInsert');
            assert.equals(event.operation, 'save');
            assert.equals(event.saveArgs, {
                entity: {
                    prop1: 'a',
                    type: 'fish'
                }
            });

            event.doc.prop2 = 'b';

            callback();
        });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    },
                    eventHooks: {
                        preInsert: preInsertStub
                    }
                }
            ]
        });

        var that = this;
        var entity = { type: 'fish', prop1: 'a' };
        db.save(entity, function (err) {
            refute(err);
            assert.equals(entity._id, 'F1');
            assert.equals(entity._rev, 'F2R');
            assert.calledOnce(preInsertStub);
            assert(that.nock.isDone());
            done();
        });
    },
    'preInsert: can manipulate doc before update': function (done) {
        this.nock
            .put('/main/F1', {
                _rev: 'F1R',
                prop1: 'a',
                prop2: 'b',
                type: 'fish'
            }).reply(200, { id: 'F1', rev: 'F2R' });
        var preInsertStub = sinon.spy(function (event, callback) {
            assert.equals(event.doc, {
                _id: 'F1',
                _rev: 'F1R',
                prop1: 'a',
                type: 'fish'
            });
            assert.equals(event.type, 'preInsert');
            assert.equals(event.operation, 'update');
            assert.equals(event.updateArgs, {
                entity: {
                    _id: 'F1',
                    _rev: 'F1R',
                    prop1: 'a',
                    type: 'fish'
                }
            });

            event.doc.prop2 = 'b';

            callback();
        });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    },
                    eventHooks: {
                        preInsert: preInsertStub
                    }
                }
            ]
        });

        var that = this;
        var entity = { _id: 'F1', _rev: 'F1R', type: 'fish', prop1: 'a' };
        db.update(entity, function (err) {
            refute(err);
            assert.equals(entity._rev, 'F2R');
            assert.calledOnce(preInsertStub);
            assert(that.nock.isDone());
            done();
        });

    }
});

function createDb(options) {
    return require('../lib/smartdb.js')(options);
}