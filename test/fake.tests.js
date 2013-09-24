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
    }
});

function createFake(options) {
    return require('../lib/smartdb.js').fake(options);
}