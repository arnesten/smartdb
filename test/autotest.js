let path = require('path');
let bocha = require('bocha');

bocha.watch({
    srcPath: path.join(__dirname, '..'),
    testPath: __dirname,
    fileSuffix: '.tests.js'
});