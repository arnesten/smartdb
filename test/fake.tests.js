var _ = require('underscore');
var buster = require('buster');
var sinon = require('sinon');
var testCase = buster.testCase;
var assert = buster.assertions.assert;
var refute = buster.assertions.refute;

module.exports = testCase('fake', {
    'can fake get()': function (done) {
        var fakeSmartDb = createFake({
            entities: [
                { _id: 'F1', type: 'fish', name: 'Shark' }
            ]
        });

        fakeSmartDb.get('fish', 'F1', function (err, doc) {
            refute(err);
            assert.equals(doc, { _id: 'F1', type: 'fish', name: 'Shark' });
            done();
        });
    }
});

function createFake(options) {
    return require('../lib/smartDb').fake(options);
}