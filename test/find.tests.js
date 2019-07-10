let { testCase, assert } = require('bocha');
let nock = require('nock');
let SmartDb = require('../lib/SmartDb.js');

module.exports = testCase('find', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'can find': async function () {
        this.nock
            .post('/animals/_find/fish', {
                selector: {
                    name: 'Great white',
                    use_index: 'byName'
                }
            })
            .reply(200, {
                docs: [
                    { _id: 'F1', name: 'Great white' }
                ]
            });
        let db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ],
            getEntityCreator: function () {
                return function (doc) {
                    return new Fish(doc);
                }
            }
        });

        let result = await db.find('fish', 'byName', {
            selector: {
                name: 'Great white'
            }
        });

        assert.equals(result.length, 1);
        assert.equals(result[0], { _id: 'F1', name: 'Great white' });
        assert.equals(result[0].constructor, Fish);
    }
});

function createDb(options) {
    return SmartDb(options);
}

function Fish(doc) {
    Object.assign(this, doc);
}