let Nano = require('nano');
let request = require('request');
let http = require('http');

const ITERATIONS = 100;
const PARALLEL = 1;

let jar = request.jar();

let agent1 = new http.Agent({ keepAlive: true });
let agent2 = new http.Agent({ keepAlive: true });

let nano = Nano({ url: 'http://127.0.0.1:5984', requestDefaults: { jar, agent1 } });
let nanoWithoutCookie = Nano({ url: 'http://test:testtest@127.0.0.1:5984', requestDefaults: { agent2 } });

run();

async function run() {
    await nano.auth('test', 'testtest');

    let noCookieTaskDb = nanoWithoutCookie.db.use('kf_dev_task');
    console.time('nocookie');
    for (let i = 0; i < ITERATIONS; i++) {
        try {
            let promises = [];
            for (let j = 0; j < PARALLEL; j++) {
                promises.push(noCookieTaskDb.get('x-' + Math.random()));
            }
            await Promise.all(promises);
        }
        catch (err) {
        }
    }
    console.timeEnd('nocookie');

    let taskDb = nano.db.use('kf_dev_task');
    console.time('cookie');
    for (let i = 0; i < ITERATIONS; i++) {
        try {
            let promises = [];
            for (let j = 0; j < PARALLEL; j++) {
                promises.push(taskDb.get('x-' + Math.random()));
            }
            await Promise.all(promises);
        }
        catch (err) {}
    }
    console.timeEnd('cookie');
}