var bocha = require('bocha');
var sinon = require('sinon');
var testCase = bocha.testCase;
var assert = bocha.assert;
var refute = bocha.refute;

module.exports = testCase('fake', {
    'can fake get()': function (done) {
        var fakeDb = createFake({
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
        var fakeDb = createFake({
            entities: [
                { _id: 'F1', type: 'fish', name: 'Shark' }
            ]
        });

        return fakeDb.get('fish', 'F1').then(doc => {
            assert.equals(doc, { _id: 'F1', type: 'fish', name: 'Shark' });
        });
    },
	'get() works in async mode': function (done) {
		var fakeDb = createFake({
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
        var fakeDb = createFake({
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
		var fish1 = { _id: 'F1', type: 'fish', name: 'Shark' };
		var fish2 = { _id: 'F2', type: 'fish', name: 'Shark' };
		var fakeDb = createFake({
			async: true,
			entities: [fish1, fish2]
		});

		var stub = sinon.stub();

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
	}
});

function createFake(options) {
    return require('../lib/smartdb.js').fake(options);
}