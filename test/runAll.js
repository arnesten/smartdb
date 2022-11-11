import { runOnce } from 'bocha/node.mjs';
import { URL } from 'url';

let __dirname = new URL('.', import.meta.url).pathname;

runOnce(__dirname, {
    fileSuffix: '.tests.js'
});