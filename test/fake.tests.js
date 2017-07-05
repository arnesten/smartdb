let bocha = require('bocha');
let sinon = require('sinon');
let testCase = bocha.testCase;
let assert = bocha.assert;
let refute = bocha.refute;
let smartdb = require('../lib/smartdb.js');

module.exports = testCase('fake', {
    'can fake get()': function (done) {
        let fakeDb = createFake({
            entities: [
                { _id: 'F1', type: 'fish', name: 'Shark' }
            ]
        });

        fakeDb.get('fish', 'F1', function (err, doc) {
            refute(err);
            assert.equals(doc, { _id: 'F1', type: 'fish', name: 'Shark' });
            done();
        });
    },
    'get() without callback returns promise': function () {
        let fakeDb = createFake({
            entities: [
                { _id: 'F1', type: 'fish', name: 'Shark' }
            ]
        });

        return fakeDb.get('fish', 'F1').then(doc => {
            assert.equals(doc, { _id: 'F1', type: 'fish', name: 'Shark' });
        });
    },
	'get() works in async mode': function (done) {
		let fakeDb = createFake({
			async: true,
			entities: [
				{ _id: 'F1', type: 'fish', name: 'Shark' }
			]
		});

		fakeDb.get('fish', 'F1', function (err, doc) {
			refute(err);
			assert.equals(doc, { _id: 'F1', type: 'fish', name: 'Shark' });
			done();
		});
	},
    'get() with async mode and without callback returns promise': function () {
        let fakeDb = createFake({
            async: true,
            entities: [
                { _id: 'F1', type: 'fish', name: 'Shark' }
            ]
        });

        return fakeDb.get('fish', 'F1').then(doc => {
            assert.equals(doc, { _id: 'F1', type: 'fish', name: 'Shark' });
        });
    },
	'can force async mode': function () {
		let fish1 = { _id: 'F1', type: 'fish', name: 'Shark' };
		let fish2 = { _id: 'F2', type: 'fish', name: 'Shark' };
		let fakeDb = createFake({
			async: true,
			entities: [fish1, fish2]
		});

		let stub = sinon.stub();

		fakeDb.get('fish', 'F1', stub);
		fakeDb.getOrNull('fish', 'F1', stub);
		fakeDb.save(fish1, stub);
		fakeDb.update(fish1, stub);
		fakeDb.merge('fish', 'F2', {}, stub);
		fakeDb.remove('fish', 'F2', stub);
		fakeDb.view('fish', 'inTheSea', { }, stub);
		fakeDb.viewRaw('fish', 'inTheSea', { }, stub);
		fakeDb.viewValue('fish', 'inTheSea', { }, stub);

		refute.called(stub);
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