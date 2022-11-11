import { assert, testCase } from 'bocha/node.mjs';
import nock from 'nock';
import SmartDb from '../lib/SmartDb.js';

export default testCase('find', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'can find with explicit selector': async function () {
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
        let db = SmartDb({
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
    'can find with implicit selector': async function () {
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
        let db = SmartDb({
            databases: [{
                url: 'http://myserver.com/animals',
                entities: {
                    fish: {}
                }
            }],
            mapDocToEntity: doc => new Fish(doc)
        });

        let result = await db.find('fish', 'byName', {
            name: 'Great white'
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
        let db = SmartDb({
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
        let db = SmartDb({
            databases: [{
                url: 'http://myserver.com/animals',
                entities: {
                    fish: {}
                }
            }],
            findHook(type, index, args) {
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
        let db = SmartDb({
            databases: [{
                url: 'http://myserver.com/animals',
                entities: {
                    fish: {}
                }
            }],
            findHook() {
                throw new Error('Invalid');
            }
        });

        let err = await catchError(() => db.find('fish', 'byName', {
            selector: {
                name: 'Great white'
            }
        }));

        assert.equals(err.message, 'Invalid');
    },
    'can set a default find limit': async function () {
        this.nock
            .post('/animals/_find', {
                selector: {
                    name: 'Great white',
                },
                use_index: 'byName',
                limit: 10000
            })
            .reply(200, {
                docs: [
                    { _id: 'F1', name: 'Great white' }
                ]
            });
        let db = SmartDb({
            defaultFindLimit: 10000,
            databases: [{
                url: 'http://myserver.com/animals',
                entities: {
                    fish: {}
                }
            }]
        });

        let result = await db.find('fish', 'byName', {
            name: 'Great white'
        });

        assert.equals(result, [{ _id: 'F1', name: 'Great white' }]);
    }
});

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