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
    'save: with invalid entity': async function () {
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
            validate(entity) {
                assert.equals(entity, new Fish({ name: 'Shark' }));
                return Promise.reject(new Error('Invalid'));
            }
        });
        let fish = new Fish({ name: 'Shark' });

        let err = await catchError(() => db.save(fish));

        assert.equals(err, new Error('Invalid'));
        refute(fish._id);
    },
    'save: with valid entity': async function () {
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
            validate(entity) {
                assert.equals(entity, new Fish({ name: 'Shark' }));
                return Promise.resolve();
            }
        });
        let fish = new Fish({ name: 'Shark' });

        await db.save(fish);

        assert(fish._id);
    },
    'merge: creating an invalid entity should throw exception': async function () {
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
            validate(entity,) {
                assert.equals(entity, { _id: 'F1', type: 'fish', change: true });
                return Promise.reject(new Error('ValidationError'));
            }
        });

        let err = await catchError(() => db.merge('fish', 'F1', { change: true }));

        assert.equals(err, new Error('ValidationError'));
    }
});

function Fish(doc) {
    Object.assign(this, doc);
    this.type = 'fish';
}

function createDb(options) {
    return require('../lib/SmartDb.js')(options);
}

async function catchError(fn) {
    try {
        await fn();
    }
    catch (err) {
        return err;
    }
}