var _ = require('underscore');
var buster = require('buster');
var sinon = require('sinon');
var testCase = buster.testCase;
var assert = buster.assert;
var refute = buster.refute;

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