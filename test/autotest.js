var path = require('path');
var busterHelpers = require('buster-helpers');

busterHelpers.startAutoTest({
    srcPath: path.join(__dirname, '..'),
    testPath: __dirname,
    fileSuffix: '.tests.js'
});