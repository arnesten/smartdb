import { assert, refute, testCase, catchErrorAsync } from 'bocha/node.mjs';
import nock from 'nock';
import SmartDb from '../lib/SmartDb.js';

export default testCase('validation', {
    setUp() {
        this.nock = nock('http://myserver.com');
    },
    tearDown() {
        nock.cleanAll();
    },
    'save: with invalid entity': async function () {
        this.nock
            .post('/main', { name: 'Shark', type: 'fish' }).reply(200, {
            id: 'C1',
            rev: 'C1R'
        });
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            validate(entity) {
                assert.equals(entity, new Fish({ name: 'Shark' }));
                return Promise.reject(new Error('Invalid'));
            }
        });
        let fish = new Fish({ name: 'Shark' });

        let err = await catchErrorAsync(() => db.save(fish));

        assert.equals(err, new Error('Invalid'));
        refute(fish._id);
    },
    'save: with valid entity': async function () {
        this.nock
            .post('/main', { name: 'Shark', type: 'fish' }).reply(200, {
            id: 'C1',
            rev: 'C1R'
        });
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            validate(entity) {
                assert.equals(entity, new Fish({ name: 'Shark' }));
                return Promise.resolve();
            }
        });
        let fish = new Fish({ name: 'Shark' });

        await db.save(fish);

        assert(fish._id);
    },
    'merge: creating an invalid entity should throw exception': async function () {
        this.nock
            .get('/main/F1').reply(200, {
            _id: 'F1',
            type: 'fish'
        });
        let db = SmartDb({
            databases: [
                {
                    url: 'http://myserver.com/main',
                    entities: {
                        fish: {}
                    }
                }
            ],
            validate(entity,) {
                assert.equals(entity, { _id: 'F1', type: 'fish', change: true });
                return Promise.reject(new Error('ValidationError'));
            }
        });

        let err = await catchErrorAsync(() => db.merge('fish', 'F1', { change: true }));

        assert.equals(err, new Error('ValidationError'));
    }
});

function Fish(doc) {
    Object.assign(this, doc);
    this.type = 'fish';
}