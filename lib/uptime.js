var fs = require('fs')
  , util = require('util')
  , _ = require('underscore')
  , handlebars = require('handlebars')
  , EventEmitter = require('events').EventEmitter

var ParamedicCollection
  , ParamedicTest
  , Paramedic

var pageTemplate = handlebars.compile(fs.readFileSync(__dirname + '/index.handlebars', 'utf8'))

handlebars.registerHelper('gte', function(compare1, compare2, next) {
    if (!next) {
        return '';
    }
    if (compare1 >= compare2 && next.fn) {
        return next.fn(this);
    }
    if (next.inverse) {
        return next.inverse(this);
    }
    return '';
});

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

    function startTesting(test) {
        if (options.testNow) {
            self.triggerTest(test);
        }

        setInterval(function() {
            self.triggerTest(test);
        }, test.options.interval || self.defaults.interval);
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
        res.end(pageTemplate({
              status: self
            , title: options.title || 'Paramedic Server'
        }));
    };
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
    this.lastError = false;
    this.lastErrorTime = false;
    this.lastErrorMessage = false;
};
util.inherits(ParamedicTest, EventEmitter);

ParamedicTest.prototype.statuses = {
      untested: { id: -1, label: 'Untested', shortcode: 'untested' }
    , stable:   { id:  0, label: 'Stable'  , shortcode: 'stable' }
    , warn:     { id:  1, label: 'Warn'    , shortcode: 'warn' }
    , error:    { id:  2, label: 'Error'   , shortcode: 'err' }
};

ParamedicTest.prototype.trigger = function trigger(callback) {
    var self = this;

    this.callback.call(this, function done(err){
        if (typeof err === 'string') err = new Error(err);
        callback(err, { error: true });
    }, function warn(err) {
        if (typeof err === 'string') err = new Error(err);
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