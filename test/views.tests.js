import { assert, testCase, catchErrorAsync } from 'bocha/node.mjs';
import nock from 'nock';
import SmartDb from '../lib/SmartDb.js';

export default testCase('views', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'view: without specified rewrite': async function () {
        this.nock
            .get('/animals/_design/fish/_view/getSharks?include_docs=true').reply(200, {
            rows: [
                { doc: { _id: 'F1', name: 'Great white' } }
            ]
        });
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ],
            getEntityCreator() {
                return doc => new Fish(doc);
            }
        });

        let sharks = await db.view('fish', 'getSharks', {});

        assert.equals(sharks, [
            new Fish({
                _id: 'F1',
                name: 'Great white'
            })
        ]);
    },
    'view: where one of the docs are not set, should ignore': async function () {
        this.nock
            .get('/animals/_design/fish/_view/getSharks?include_docs=true').reply(200, {
            rows: [
                { doc: { _id: 'F1', name: 'Great white' } },
                {},
                { doc: { _id: 'F2', name: 'Small blue' } },
            ]
        });
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ],
            getEntityCreator() {
                return doc => new Fish(doc);
            }
        });

        let sharks = await db.view('fish', 'getSharks', {});

        assert.equals(sharks, [
            new Fish({
                _id: 'F1',
                name: 'Great white'
            }),
            new Fish({
                _id: 'F2',
                name: 'Small blue'
            })
        ]);
    },

    'view: with specified rewrite': async function () {
        this.nock
            .get('/animals/_design/fish-getSharks/_view/fn?include_docs=true').reply(200, {
            rows: [
                { doc: { _id: 'F1', name: 'Great white' } }
            ]
        });
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ],
            getEntityCreator() {
                return doc => new Fish(doc)
            },
            rewriteView(type, viewName) {
                return [`${type}-${viewName}`, 'fn'];
            }
        });

        let sharks = await db.view('fish', 'getSharks', {});

        assert.equals(sharks, [
            new Fish({
                _id: 'F1',
                name: 'Great white'
            })
        ]);
    },
    'view: requesting view that does NOT exist': async function () {
        this.nock
            .get('/animals/_design/fish/_view/getSharks?include_docs=true').reply(404, {
            error: 'not_found'
        });
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        let err = await catchErrorAsync(() => db.view('fish', 'getSharks', {}));

        assert.equals(err, new Error('View not found: _design/fish/_view/getSharks'));
    },
    'view: with key set to "undefined" should throw error': async function () {
        let db = SmartDb({
            databases: [{
                url: 'http://myserver.com/animals',
                entities: {
                    fish: {}
                }
            }]
        });

        let err = await catchErrorAsync(() => db.view('fish', 'getSharks', { key: undefined }));

        assert.equals(err.message, '"key" should not be set to undefined since that will fetch any documents');
    },
    'viewValue': async function () {
        this.nock
            .get('/animals/_design/fish/_view/countBones').reply(200, {
            rows: [
                { value: 1 },
                { value: 2 }
            ]
        });
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        let values = await db.viewValue('fish', 'countBones', {});

        assert.equals(values, [1, 2]);
    },
    'viewRaw': async function () {
        this.nock
            .get('/animals/_design/fish/_view/countBones').reply(200, {
            rows: [
                { value: 1, key: 'Shark' },
                { value: 2, key: 'Bass' }
            ]
        });
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        let values = await db.viewRaw('fish', 'countBones', {});

        assert.equals(values, [
            { value: 1, key: 'Shark' },
            { value: 2, key: 'Bass' }
        ]);
    }
});

function Fish(doc) {
    Object.assign(this, doc);
}