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
            .post('/animals/_find', {
                selector: {
                    name: 'Great white',
                },
                use_index: 'byName'
            })
            .reply(200, {
                docs: [
                    { _id: 'F1', name: 'Great white' }
                ]
            });
        let db = createDb({
            databases: [{
                url: 'http://myserver.com/animals',
                entities: {
                    fish: {}
                }
            }],
            mapDocToEntity: doc => new Fish(doc)
        });

        let result = await db.find('fish', 'byName', {
            selector: {
                name: 'Great white'
            }
        });

        assert.equals(result.length, 1);
        assert.equals(result[0], { _id: 'F1', name: 'Great white' });
        assert.equals(result[0].constructor, Fish);
    },
    'can rewrite index name': async function () {
        this.nock
            .post('/animals/_find', {
                selector: {
                    name: 'Great white',
                },
                use_index: 'fish_byName'
            })
            .reply(200, {
                docs: [
                    { _id: 'F1', name: 'Great white' }
                ]
            });
        let db = createDb({
            databases: [{
                url: 'http://myserver.com/animals',
                entities: {
                    fish: {}
                }
            }],
            rewriteIndexName: (type, indexName) => type + '_' + indexName
        });

        let result = await db.find('fish', 'byName', {
            selector: {
                name: 'Great white'
            }
        });

        assert.equals(result, [{ _id: 'F1', name: 'Great white' }]);
    },
    'can use a hook to add information': async function () {
        this.nock
            .post('/animals/_find', {
                selector: {
                    name: 'Great white',
                },
                use_index: 'byName',
                foo: 'bar'
            })
            .reply(200, {
                docs: [
                    { _id: 'F1', name: 'Great white' }
                ]
            });
        let db = createDb({
            databases: [{
                url: 'http://myserver.com/animals',
                entities: {
                    fish: {}
                }
            }],
            findHook: args => {
                args.foo = 'bar';
            }
        });

        let result = await db.find('fish', 'byName', {
            selector: {
                name: 'Great white'
            }
        });

        assert.equals(result, [{ _id: 'F1', name: 'Great white' }]);
    },
    'can use a hook to validate': async function () {
        let db = createDb({
            databases: [{
                url: 'http://myserver.com/animals',
                entities: {
                    fish: {}
                }
            }],
            findHook: () => {
                throw new Error('Invalid');
            }
        });

        let err = await catchError(() => db.find('fish', 'byName', {
            selector: {
                name: 'Great white'
            }
        }));

        assert.equals(err.message, 'Invalid');
    }
});

function createDb(options) {
    return SmartDb(options);
}

function Fish(doc) {
    Object.assign(this, doc);
}

async function catchError(fn) {
    try {
        await fn();
    }
    catch (err) {
        return err;
    }
}