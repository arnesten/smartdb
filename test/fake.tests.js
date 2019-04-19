let bocha = require('bocha');
let sinon = require('sinon');
let testCase = bocha.testCase;
let assert = bocha.assert;
let refute = bocha.refute;
let smartdb = require('../lib/smartdb.js');

module.exports = testCase('fake', {
    'can fake get()': async function () {
        let fakeDb = createFake({
            entities: [
                { _id: 'F1', type: 'fish', name: 'Shark' }
            ]
        });

        let doc = await fakeDb.get('fish', 'F1');

        assert.equals(doc, { _id: 'F1', type: 'fish', name: 'Shark' });
    },
    'updateWithRetry() can update entity': async function () {
        let fakeDb = createFake({
            entities: [{ _id: 'F1', type: 'fish' }]
        });

        let fish = await fakeDb.updateWithRetry('fish', 'F1', fish => {
            fish.name = 'Shark';
        });

        assert.equals(fish, { _id: 'F1', type: 'fish', name: 'Shark' });
    }
});

function createFake(options) {
    return smartdb.fake(options);
}