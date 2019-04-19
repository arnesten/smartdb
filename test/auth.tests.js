let bocha = require('bocha');
let testCase = bocha.testCase;
let assert = bocha.assert;
let nock = require('nock');

module.exports = testCase('auth', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'get: when giving auth and error appears, should NOT show authentication info': async function () {
        this.nock
            .get('/animals/F1').reply(500);
        let db = createDb({
            databases: [
                {
                    url: 'http://admin:12345@myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        let err = await catchError(() => db.get('fish', 'F1'));

        assert(err);
        assert(JSON.stringify(err).indexOf('admin:12345') < 0);
    },
    'list: when giving auth and error appears, should NOT show authentication info': async function () {
        this.nock
            .get('/animals/_design/fish/_list/myList/myView').reply(500);
        let db = createDb({
            databases: [
                {
                    url: 'http://admin:12345@myserver.com/animals',
                    entities: {
                        fish: {}
                    }
                }
            ]
        });

        let err = await catchError(() => db.list('fish', 'myList', 'myView', {}));

        assert(err);
        assert(JSON.stringify(err).indexOf('admin:12345') < 0);
    }
});

function createDb(options) {
    return require('../lib/smartdb.js')(options);
}

async function catchError(fn) {
    try {
        await fn();
    }
    catch (err) {
        return err;
    }
}