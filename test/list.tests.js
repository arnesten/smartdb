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
    'list: without rewrite': async function () {
        this.nock
            .get('/animals/_design/fish/_list/myList/myView?group=true').reply(200, '<b>Shark</b>');
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

        let result = await db.list('fish', 'myList', 'myView', { group: true });

        assert.equals(result, '<b>Shark</b>');
    },
    'list: with keys array': async function () {
        this.nock
            .get('/animals/_design/fish/_list/myList/myView?keys=%5B%221%22%2C2%5D').reply(200, '<b>Shark</b>');
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

        let result = await db.list('fish', 'myList', 'myView', { keys: ["1", 2] });

        assert.equals(result, '<b>Shark</b>');
    }
});

function createDb(options) {
    return require('../lib/smartdb.js')(options);
}