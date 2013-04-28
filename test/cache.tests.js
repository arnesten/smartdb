var _ = require('underscore');
var buster = require('buster');
var sinon = require('sinon');
var testCase = buster.testCase;
var assert = buster.assertions.assert;
var refute = buster.assertions.refute;
var nock = require('nock');

module.exports = testCase('cache', {
    setUp: function () {
        this.nock = nock('http://myserver.com');
    },
    tearDown: function () {
        nock.cleanAll();
    },
    'getting entity twice with cacheMaxSize set, should get from cache': function (done) {
        this.nock
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1'
            })
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R2'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {
                            cacheMaxSize: 1
                        }
                    }
                }
            ]
        });

        db.get('fish', 'F1', function (err, fish) {
            refute(err);
            assert.equals(fish, { _id: 'F1', _rev: 'F1R1' });

            db.get('fish', 'F1', function (err, fish2) {
                refute(err);
                assert.equals(fish2, { _id: 'F1', _rev: 'F1R1' });

                done();
            });
        });
    },

    'getting entity twice without cache set, should NOT get from cache': function (done) {
        this.nock
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1'
            })
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R2'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: { }
                    }
                }
            ]
        });

        db.get('fish', 'F1', function (err, fish) {
            refute(err);
            assert.equals(fish, { _id: 'F1', _rev: 'F1R1' });

            db.get('fish', 'F1', function (err, fish2) {
                refute(err);
                assert.equals(fish2, { _id: 'F1', _rev: 'F1R2' });

                done();
            });
        });
    },

    'getting first cached entity after cache size exceeded, should NOT get from cache': function (done) {
        this.nock
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1'
            })
            .get('/animals/F2').reply(200, {
                _id: 'F2',
                _rev: 'F2R1'
            })
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R2'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: {
                            cacheMaxSize: 1
                        }
                    }
                }
            ]
        });

        db.get('fish', 'F1', function (err, fish1) {
            assert.equals(fish1, { _id: 'F1', _rev: 'F1R1' });
            db.get('fish', 'F2', function (err, fish2) {
                assert.equals(fish2, { _id: 'F2', _rev: 'F2R1' });
                db.get('fish', 'F1', function (err, fish3) {
                    assert.equals(fish3, { _id: 'F1', _rev: 'F1R2' });
                    done();
                });
            });
        });
    },
    'cacheMaxAge set': {
        setUp: function () {
            this.timeout = 3000;
            this.clock = sinon.useFakeTimers();
        },
        tearDown: function () {
            this.clock.restore();
        },
        'and getting entity twice within age limit should get from cache': function (done) {
            this.nock
                .get('/animals/F1').reply(200, {
                    _id: 'F1',
                    _rev: 'F1R1'
                })
                .get('/animals/F1').reply(200, {
                    _id: 'F1',
                    _rev: 'F1R2'
                });
            var db = createDb({
                databases: [
                    {
                        url: 'http://myserver.com/animals',
                        entities: {
                            fish: {
                                cacheMaxAge: 2000
                            }
                        }
                    }
                ]
            });

            var that = this;
            db.get('fish', 'F1', function (err, fish) {
                assert.equals(fish, { _id: 'F1', _rev: 'F1R1' });

                that.clock.tick(1999);

                db.get('fish', 'F1', function (err, fish2) {
                    assert.equals(fish2, { _id: 'F1', _rev: 'F1R1' });
                    done();
                });
            });
        },
        'and getting entity twice outside age limit should NOT get from cache': function (done) {
            this.nock
                .get('/animals/F1').reply(200, {
                    _id: 'F1',
                    _rev: 'F1R1'
                })
                .get('/animals/F1').reply(200, {
                    _id: 'F1',
                    _rev: 'F1R2'
                });
            var db = createDb({
                databases: [
                    {
                        url: 'http://myserver.com/animals',
                        entities: {
                            fish: {
                                cacheMaxAge: 2000
                            }
                        }
                    }
                ]
            });

            var that = this;
            db.get('fish', 'F1', function (err, fish) {
                assert.equals(fish, { _id: 'F1', _rev: 'F1R1' });

                that.clock.tick(2001);

                db.get('fish', 'F1', function (err, fish2) {
                    assert.equals(fish2, { _id: 'F1', _rev: 'F1R2' });
                    done();
                });
            });
        }
    },
    'updating task should clear it from cache': function (done) {
        this.nock
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1',
                type: 'fish'
            })
            .put('/animals/F1', { _rev: 'F1R1', type: 'fish' }).reply(200, {
                _id: 'F1',
                _rev: 'F1R2'
            })
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R3',
                type: 'fish'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: { cacheMaxSize: 10 }
                    }
                }
            ]
        });

        db.get('fish', 'F1', function (err, fish) {
            db.update(fish, function (err) {
                refute(err);

                db.get('fish', 'F1', function (err, fish2) {
                    refute(err);
                    assert.equals(fish2, { _id: 'F1', _rev: 'F1R3', type: 'fish' });

                    done();
                });
            });
        });
    },
    'merging task should clear it from cache': function (done) {
        this.nock
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1',
                type: 'fish'
            })
            .put('/animals/F1', { _rev: 'F1R1', type: 'fish', name: 'Sharky' }).reply(200, {
                _id: 'F1',
                _rev: 'F1R2'
            })
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R3',
                name: 'Sharky',
                type: 'fish'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: { cacheMaxSize: 10 }
                    }
                }
            ]
        });

        db.get('fish', 'F1', function (err, fish) {
            db.merge('fish', 'F1', { name: 'Sharky' }, function (err) {
                refute(err);

                db.get('fish', 'F1', function (err, fish2) {
                    refute(err);
                    assert.equals(fish2, { _id: 'F1', _rev: 'F1R3', type: 'fish', name: 'Sharky' });

                    done();
                });
            });
        });
    },
    'removing task should clear it from cache': function (done) {
        this.nock
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R1',
                type: 'fish'
            })
            .delete('/animals/F1?rev=F1R1').reply(200)
            .get('/animals/F1').reply(200, {
                _id: 'F1',
                _rev: 'F1R2',
                type: 'fish'
            });
        var db = createDb({
            databases: [
                {
                    url: 'http://myserver.com/animals',
                    entities: {
                        fish: { cacheMaxSize: 10 }
                    }
                }
            ]
        });

        db.get('fish', 'F1', function (err, fish) {
            db.remove('fish', 'F1', function (err) {
                refute(err);

                db.get('fish', 'F1', function (err, fish2) {
                    refute(err);
                    assert.equals(fish2, { _id: 'F1', _rev: 'F1R2', type: 'fish' });

                    done();
                });
            });
        });
    }
});

function createDb(options) {
    return require('../lib/smartdb.js')(options);
}