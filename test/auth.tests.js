var _ = require('underscore');
var buster = require('buster');
var testCase = buster.testCase;
var assert = buster.assertions.assert;
var refute = buster.assertions.refute;
var nock = require('nock');

module.exports = testCase('auth', {
    setUp: function () {
        this.nock = nock('http://myserver.com');
    },
    tearDown: function () {
        nock.cleanAll();
    },
    'get: when giving auth and error appears, should NOT show authentication info': function (done) {
        this.nock
            .get('/animals/F1').reply(500);
        var smartDb = createDb({
            databases: [
                {
                    url: 'http://admin:12345@myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        smartDb.get('fish', 'F1', function (err) {
            assert(err);
            assert(JSON.stringify(err).indexOf('admin:12345') < 0);
            done();
        });
    },
    'list: when giving auth and error appears, should NOT show authentication info': function (done) {
        this.nock
            .get('/animals/_design/fish/_list/myList/myView').reply(500);
        var smartDb = createDb({
            databases: [
                {
                    url: 'http://admin:12345@myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        smartDb.list('fish', 'myList', 'myView', {}, function (err) {
            assert(err);
            assert(JSON.stringify(err).indexOf('admin:12345') < 0);
            done();
        });
    }
});

function createDb(options) {
    return require('../lib/smartDb')(options);
}