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
    'list: without rewrite': function (done) {
        this.nock
            .get('/animals/_design/fish/_list/myList/myView?group=true').reply(200, '<b>Shark</b>');
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

        smartDb.list('fish', 'myList', 'myView', { group: true }, function (err, result) {
            refute(err);

            assert.equals(result, '<b>Shark</b>');
            done();
        });
    }
});


function createDb(options) {
    return require('../lib/smartDb')(options);
}