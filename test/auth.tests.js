var bocha = require('bocha');
var testCase = bocha.testCase;
var assert = bocha.assert;
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
        var db = createDb({
            databases: [
                {
                    url: 'http://admin:12345@myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        db.get('fish', 'F1', function (err) {
            assert(err);
            assert(JSON.stringify(err).indexOf('admin:12345') < 0);
            done();
        });
    },
    'list: when giving auth and error appears, should NOT show authentication info': function (done) {
        this.nock
            .get('/animals/_design/fish/_list/myList/myView').reply(500);
        var db = createDb({
            databases: [
                {
                    url: 'http://admin:12345@myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        db.list('fish', 'myList', 'myView', {}, function (err) {
            assert(err);
            assert(JSON.stringify(err).indexOf('admin:12345') < 0);
            done();
        });
    }
});

function createDb(options) {
    return require('../lib/smartdb.js')(options);
}