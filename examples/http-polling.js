var uptime = require('../index').createServer()
  , request = require('request')
  , http = require('http');

uptime.collection('Server Pings', function(data) {
	this.test(data.name, function(done, warn) {
		request.get(data.url, done);
	}).interval(data.interval);
}).add({
	  name: 'Google UK'
	, url: 'http://google.co.uk'
	, interval: 30000
}).add({
	  name: 'Google AU'
	, url: 'http://google.com.au'
	, interval: 30000
}).add({
	  name: 'Facebook'
	, url: 'http://facebook.com'
	, interval: 60000
}).add({
	  name: 'Twitter'
	, url: 'http://twitter.com'
	, interval: 60000
}).add({
	  name: 'localhost'
	, url: 'http://localhost:80/'
	, interval: 30000
})

http.createServer(uptime.start({
	  title: 'Web Uptime Monitor'
	, testNow: true
})).listen(8080);

uptime.on('error', function(err, test) {
	console.log('Hey, "' + test.name + '" is down!');
});