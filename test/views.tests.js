var _ = require('underscore');
var buster = require('buster');
var sinon = require('sinon');
var testCase = buster.testCase;
var assert = buster.assertions.assert;
var refute = buster.assertions.refute;
var nock = require('nock');

module.exports = testCase('views', {
    setUp: function () {
        this.nock = nock('http://myserver.com');
    },
    tearDown: function () {
        nock.cleanAll();
    },
    'view: without specified rewrite': function (done) {
        this.nock
            .get('/animals/_design/fish/_view/getSharks?include_docs=true').reply(200, {
                rows: [
                    { doc: { _id: 'F1', name: 'Great white' } }
                ]
            });
        var smartDb = createDb({
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
            }
        });

        smartDb.view('fish', 'getSharks', { }, function (err, sharks) {
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
    'view: with specified rewrite': function (done) {
        this.nock
            .get('/animals/_design/fish-getSharks/_view/fn?include_docs=true').reply(200, {
                rows: [
                    { doc: { _id: 'F1', name: 'Great white' } }
                ]
            });
        var smartDb = createDb({
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

        smartDb.view('fish', 'getSharks', { }, function (err, sharks) {
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
        var smartDb = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        smartDb.view('fish', 'getSharks', { }, function (err) {
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
        var smartDb = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        smartDb.viewValue('fish', 'countBones', { }, function (err, values) {
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
        var smartDb = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        smartDb.viewRaw('fish', 'countBones', { }, function (err, values) {
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
    _.extend(this, doc);
}

function createDb(options) {
    return require('../lib/smartDb')(options);
}