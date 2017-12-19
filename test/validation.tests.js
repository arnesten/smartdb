let bocha = require('bocha');
let testCase = bocha.testCase;
let assert = bocha.assert;
let refute = bocha.refute;
let nock = require('nock');

module.exports = testCase('validation', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'save: with invalid entity': function (done) {
        this.nock
            .post('/main', { name: 'Shark', type: 'fish' }).reply(200, {
                id: 'C1',
                rev: 'C1R'
            });
        let db = createDb({
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
        let fish = new Fish({ name: 'Shark' });

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
        let db = createDb({
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
        let fish = new Fish({ name: 'Shark' });

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
        let db = createDb({
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
    Object.assign(this, doc);
    this.type = 'fish';
}

function createDb(options) {
    return require('../lib/smartdb.js')(options);
}