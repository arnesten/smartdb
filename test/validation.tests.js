var _ = require('underscore');
var buster = require('buster');
var testCase = buster.testCase;
var assert = buster.assertions.assert;
var refute = buster.assertions.refute;
var nock = require('nock');

module.exports = testCase('validation', {
    setUp: function () {
        this.nock = nock('http://myserver.com');
    },
    tearDown: function () {
        nock.cleanAll();
    },
    'save: with invalid entity': function (done) {
        this.nock
            .post('/main', { name: 'Shark', type: 'fish' }).reply(200, {
                id: 'C1',
                rev: 'C1R'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            validate: function (entity, callback) {
                assert.equals(entity, new Fish({ name: 'Shark' }));
                callback(new Error('Invalid'));
            }
        });
        var fish = new Fish({ name: 'Shark' });

        db.save(fish, function (err) {
            assert.equals(err, new Error('Invalid'));
            refute(fish._id);
            done();
        });
    },
    'save: with valid entity': function (done) {
        this.nock
            .post('/main', { name: 'Shark', type: 'fish' }).reply(200, {
                id: 'C1',
                rev: 'C1R'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            validate: function (entity, callback) {
                assert.equals(entity, new Fish({ name: 'Shark' }));
                callback();
            }
        });
        var fish = new Fish({ name: 'Shark' });

        db.save(fish, function (err) {
            refute(err);
            assert(fish._id);
            done();
        });
    },
    'merge: creating an invalid entity should throw exception': function (done) {
        this.nock
            .get('/main/F1').reply(200, {
                _id: 'F1',
                type: 'fish'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            validate: function (entity, callback) {
                assert.equals(entity, { _id: 'F1', type: 'fish', change: true });
                callback(new Error('ValidationError'));
            }
        });

        db.merge('fish', 'F1', { change: true }, function (err) {
            assert.equals(err, new Error('ValidationError'));
            done();
        });
    }
});

function Fish(doc) {
    _.extend(this, doc);
    this.type = 'fish';
}

function createDb(options) {
    return require('../lib/smartdb.js')(options);
}