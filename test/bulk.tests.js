let bocha = require('bocha');
let testCase = bocha.testCase;
let assert = bocha.assert;
let nock = require('nock');

module.exports = testCase('auth', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'getBulk': {
        'two entities that exist': async function () {
            this.nock
                .post('/main/_all_docs?include_docs=true', { keys: ['F1', 'F2'] }).reply(200, {
                rows: [
                    { doc: { _id: 'F1', type: 'fish' }},
                    { doc: { _id: 'F2', type: 'fish' }},
                ]
            });
            let db = createDb({
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

function createDb(options) {
    return require('../lib/smartdb.js')(options);
}

async function catchError(fn) {
    try {
        await fn();
    }
    catch (err) {
        return err;
    }
}