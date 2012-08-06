var util = require('util')
  , _ = require('underscore')
  , EventEmitter = require('events').EventEmitter

var ParamedicCollection
  , ParamedicTest
  , Paramedic
  , nextTestId = 0

var templates = require('./templates');

/**
 * This is the primary server class.
 *
 * @property {Array}  tests             An array of attached, top-level, tests.
 * @property {Array}  collections       An array of attached collections.
 * @property {Number} defaults.interval Default interval for running tests, in milliseconds.
 */
Paramedic = module.exports.Paramedic = function Paramedic() {
    if (!(this instanceof Paramedic)) {
        return new Paramedic;
    }

    this.tests = [];
    this.collections = [];
    this.defaults = {
        interval: 5000
    };
    this.started = true;

    // Workaround for node throwing
    // error events
    this.on('error', function(){});
};
util.inherits(Paramedic, EventEmitter);

/**
 * Creates a new top-level test and adds it
 * to the Paramedic server.
 *
 * @param {String}   name     The name of the test.
 * @param {Function} callback The test callback, which will be run each time its triggered.
 *
 * @return {ParamedicTest} The newly created test. Use this instance for modifying options.
 */
Paramedic.prototype.test = function test(name, callback) {
    var test, collection, options;

    test = new ParamedicTest(name, callback);

    this.tests.push(test);

    return test;
};

/**
 * Creates a new collection, and attaches to
 * the current server.
 * 
 * @param  {String}   name     The name of the collection.
 * @param  {Function} callback The collection callback. This is run each time the collection is loaded using #use.
 * @return {ParamedicCollection}
 */
Paramedic.prototype.collection = function collection(name, callback) {
    var collection = new ParamedicCollection(name, callback);

    this.collections.push(collection);

    return collection;
};

/**
 * Start testing!
 *
 * Makes the necessary `setInterval` calls to
 * trigger the tests periodically, and returns
 * a response callback that can be used with an
 * HTTP server.
 * 
 * @param  {Object} options.testNow Trigger all tests straight away.
 * 
 * @return {Function} The response callback.
 */
Paramedic.prototype.start = function start(options) {
    var self = this;

    if (this.started) {
        console.error('Warning: Paramedic server has been started more than once');
    }

    this.started = true;

    function startTesting(test) {
        test.options.interval = test.options.interval || self.defaults.interval;

        if (options.testNow) {
            self.triggerTest(test);
        }

        setInterval(function() {
            self.triggerTest(test);
        }, test.options.interval);
    };

    _(this.tests).each(startTesting);

    _(this.collections).each(function(collection) {
        _(collection.tests).each(startTesting);
    });

    return this.serverCallback(options);
};

/**
 * @internal Triggers a test according to this server's settings.
 * @param  {ParamedicTest} test The test instance to trigger.
 */
Paramedic.prototype.triggerTest = function(test) {
    var self = this;

    test.trigger(function(err, info) {
        // If errored before, but OK again: emit a 'recovery'
        if (test.status.id === test.statuses.error.id || test.status.id === test.statuses.warn.id) {
            if (!err) {
                test.status = test.statuses.stable;
                return self.emit('recover', test);
            }
        }

        // If OK, set to "stable" and carry on.
        // Used for overriding "untested".
        if (!err) {
            test.status = test.statuses.stable;
            return self.emit('pass', test);
        }

        // Otherwise, report errors and warnings
        if (info.error && test.status.id !== test.statuses.error.id) {
            test.status = test.statuses.error;
            test.lastError = err;
            test.lastErrorMessage = err.message;
            test.lastErrorTime = new Date;
            return self.emit('error', err, test);
        } else
        if (info.warn && test.status.id !== test.statuses.warn.id) {
            test.status = test.statuses.warn;
            test.lastError = err;
            test.lastErrorMessage = err.message;
            test.lastErrorTime = new Date;
            return self.emit('warn', err, test);
        }
    });
};

Paramedic.prototype.serverCallback = function serverCallback(options) {
    var self = this
      , options = options || {};

    return function(req, res) {
        var test = req.url.match(/^\/test\/([0-9]+)/);
        test = test && self.testById(test[1]);

        if (!test) {
            return res.end(templates.index({
                  status: self
                , title: options.title || 'Paramedic Server'
            }));
        }

        res.end(templates.test({
              test: test
            , title: options.title || 'Paramedic Server'
        }));
    };
};

/**
 * Returns a flattened array of all this server's
 * tests.
 * 
 * @return {Array}
 */
Paramedic.prototype.allTests = function() {
    return _.chain(this.collections)
        .map(function(collection) {
            return collection.tests;
        })
        .flatten()
        .value()
        .concat(this.tests);
};

Paramedic.prototype.testById = function(id) {
    return this.allTests().filter(function(test) {
        return test.id == id;
    })[0] || false;
};

/**
 * An individual, prepared test.
 */
ParamedicTest = module.exports.ParamedicTest = function ParamedicTest(name, callback) {
    if (!(this instanceof ParamedicTest)) {
        return new ParamedicTest(name, callback);
    }

    this.name = name;
    this.callback = callback;
    this.options = {};
    this.status = this.statuses.untested;

    this.errors = [];

    this.lastError = false;
    this.lastErrorTime = false;
    this.lastTestTime = false;
    this.lastTestLength = false;
    this.lastErrorMessage = false;
    
    this.avgTestLength = 0;

    this.id = nextTestId;
    this.passCount = 0;
    this.warnCount = 0;
    this.errorCount = 0;
    this.totalCount = 0;

    nextTestId += 1;
};
util.inherits(ParamedicTest, EventEmitter);

ParamedicTest.prototype.statuses = {
      untested: { id: -1, label: 'Untested', shortcode: 'untested' }
    , stable:   { id:  0, label: 'Stable'  , shortcode: 'stable' }
    , warn:     { id:  1, label: 'Warning'    , shortcode: 'warn' }
    , error:    { id:  2, label: 'Error'   , shortcode: 'err' }
};

ParamedicTest.prototype.trigger = function trigger(callback) {
    var self = this
      , now = new Date;

    this.lastTestTime = now;

    this.callback.call(this, function done(err){
        if (typeof err === 'string') err = new Error(err);
        self.totalCount += 1;
        self.lastTestLength = new Date - now;
        self.avgTestLength = self.avgTestLength * (self.totalCount - 1) / self.totalCount + self.lastTestLength * (1 / self.totalCount);

        if (err) {
            self.errorCount += 1;
            self.errors.unshift({ level: 'warn', err: err, time: new Date });
            if (self.errors.length > 10) {
                self.errors.pop();
            }
        } else {
            self.passCount += 1;
        }
        callback(err, { error: true });
    }, function warn(err) {
        if (typeof err === 'string') err = new Error(err);
        self.totalCount += 1;
        self.lastTestLength = new Date - now;
        self.avgTestLength = self.avgTestLength * (self.totalCount - 1) / self.totalCount + self.lastTestLength * (1 / self.totalCount);

        if (err) {
            self.warnCount += 1;
            self.errors.unshift({ level: 'warn', err: err, time: new Date });
            if (self.errors.length > 10) {
                self.errors.pop();
            }
        } else {
            self.passCount += 1;
        }
        callback(err, { warn: true });
    });
};

ParamedicTest.prototype.interval = function interval(interval) {
    this.options.interval = interval; return this;
};

/**
 * Collections of tests
 */
ParamedicCollection = module.exports.ParamedicCollection = function ParamedicCollection(name, callback) {
    if (!(this instanceof ParamedicCollection)) {
        return new ParamedicCollection(name, callback);
    }

    this.name = name;
    this.callback = callback;
    this.tests = [];
    this.options = {};
};
util.inherits(ParamedicCollection, EventEmitter);

ParamedicCollection.prototype.test = function test(name, callback) {
    var test = new ParamedicTest(name, callback);
    test.collection = this;

    this.tests.push(test);

    return test;
};

ParamedicCollection.prototype.add = function add(options) {
    this.callback.call(this, options);
    return this;
};

module.exports.createServer = function() {
    return new Paramedic;  
};