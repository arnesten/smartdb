import path from 'path';
import { watch } from 'bocha/node.mjs';
import { URL } from 'url';

let __dirname = new URL('.', import.meta.url).pathname;

watch({
    srcPath: path.join(__dirname, '..'),
    testPath: __dirname,
    fileSuffix: '.tests.js'
});