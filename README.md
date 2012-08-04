# Paramedic

A simple health monitor server for running health checks periodically.

## Installation

``` bash
npm install paramedic
```

## Usage

**Step 1:** Create a new server.

``` javascript
var medic = require('paramedic').createServer()
```

**Step 2:** Load up your tests. There are two callbacks passed to each test:
`done` and `warn`. If you pass an error (or string) as the first argument to
either of these callbacks, the test will fail: `done` emits an error,
whereas `warn` only emits a warning.

``` javascript
var request = require('request')

medic.test('Google Australia', function(done, warn) {
    request.get('http://google.com.au/', function(err) {
        return done(err);
    });
}).interval(6000);

medic.test('Google UK', function(done, warn) {
    request.get('http://google.co.uk/', function(err) {
        return warn(err);
    });
}).interval(21000);
```

**Step 3:** Start up the server! `start()` returns a request callback for you
to easily plug into an HTTP server, or as an Express route.

``` javascript
var http = require('http')
  , server = medic.start();

http.createServer(server).listen(8080);
```

After that, your server should be running on port 8080, similar to this:

![Screenshot](https://github.com/hughsk/paramedic/raw/master/examples/http-polling.png)

### Collections

You can create "collections" of tests too. These function as reusable
templates, which can then be loaded using the collection's `add` method.

``` javascript
medic.collection('Google Queries', function(data) {
    this.test('http://google.com/?q=' + data.query, function(done, warn) {
        request.get(data.url, done);
    }).interval(data.interval);
}).add({
      query: 'lorem'
    , interval:  6000
}).add({
      query: 'lorem'
    , interval: 21000
});
```

### Events

The server page will update accordingly as tests fail and recover,
but the server also emits `error`, `warn`, `pass` and `recover` events.

This can be used, for example, to send notifications or automate a recovery.