import { assert, testCase } from 'bocha/node.mjs';
import nock from 'nock';
import SmartDb from '../lib/SmartDb.js';

export default testCase('views', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'list: without rewrite': async function () {
        this.nock
            .get('/animals/_design/fish/_list/myList/myView?group=true').reply(200, '<b>Shark</b>');
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

        let result = await db.list('fish', 'myList', 'myView', { group: true });

        assert.equals(result, '<b>Shark</b>');
    },
    'list: with keys array': async function () {
        this.nock
            .get('/animals/_design/fish/_list/myList/myView?keys=%5B%221%22%2C2%5D').reply(200, '<b>Shark</b>');
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

        let result = await db.list('fish', 'myList', 'myView', { keys: ["1", 2] });

        assert.equals(result, '<b>Shark</b>');
    }
});