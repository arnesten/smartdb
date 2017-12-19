let bocha = require('bocha');
let testCase = bocha.testCase;
let assert = bocha.assert;
let refute = bocha.refute;
let nock = require('nock');

module.exports = testCase('views', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'view: without specified rewrite': function (done) {
        this.nock
            .get('/animals/_design/fish/_view/getSharks?include_docs=true').reply(200, {
                rows: [
                    { doc: { _id: 'F1', name: 'Great white' } }
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

        db.view('fish', 'getSharks', { }, function (err, sharks) {
            refute(err);
            assert.equals(sharks, [
                new Fish({
                    _id: 'F1',
                    name: 'Great white'
                })
            ]);
            done();
        });
    },
	'view: where one of the docs are not set, should ignore': function (done) {
		this.nock
			.get('/animals/_design/fish/_view/getSharks?include_docs=true').reply(200, {
				rows: [
					{ doc: { _id: 'F1', name: 'Great white' } },
					{ },
					{ doc: { _id: 'F2', name: 'Small blue' } },
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

		db.view('fish', 'getSharks', { }, function (err, sharks) {
			refute(err);
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
			done();
		});
	},

    'view: with specified rewrite': function (done) {
        this.nock
            .get('/animals/_design/fish-getSharks/_view/fn?include_docs=true').reply(200, {
                rows: [
                    { doc: { _id: 'F1', name: 'Great white' } }
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
            getEntityCreator: function (type) {
                return function (doc) {
                    return new Fish(doc);
                }
            },
            rewriteView: function (type, viewName) {
                return [type + '-' + viewName, 'fn'];
            }
        });

        db.view('fish', 'getSharks', { }, function (err, sharks) {
            refute(err);
            assert.equals(sharks, [
                new Fish({
                    _id: 'F1',
                    name: 'Great white'
                })
            ]);
            done();
        });
    },
    'view: requesting view that does NOT exist': function (done) {
        this.nock
            .get('/animals/_design/fish/_view/getSharks?include_docs=true').reply(404, {
                error: 'not_found'
            });
        let db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        db.view('fish', 'getSharks', { }, function (err) {
            assert.equals(err, new Error('View not found: _design/fish/_view/getSharks'));
            done();
        });
    },
    'viewValue': function (done) {
        this.nock
            .get('/animals/_design/fish/_view/countBones').reply(200, {
                rows: [
                    { value: 1 },
                    { value: 2 }
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
            ]
        });

        db.viewValue('fish', 'countBones', { }, function (err, values) {
            refute(err);
            assert.equals(values, [1, 2]);
            done();
        });
    },
    'viewRaw': function (done) {
        this.nock
            .get('/animals/_design/fish/_view/countBones').reply(200, {
                rows: [
                    { value: 1, key: 'Shark' },
                    { value: 2, key: 'Bass' }
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
            ]
        });

        db.viewRaw('fish', 'countBones', { }, function (err, values) {
            refute(err);
            assert.equals(values, [
                { value: 1, key: 'Shark' },
                { value: 2, key: 'Bass' }
            ]);
            done();
        });
    }
});

function Fish(doc) {
    Object.assign(this, doc);
}

function createDb(options) {
    return require('../lib/smartdb.js')(options);
}