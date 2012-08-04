var handlebars = require('handlebars')
  , moment = require('moment')
  , fs = require('fs')

var templates = module.exports = {};

templates.index = handlebars.compile(fs.readFileSync(__dirname + '/index.handlebars', 'utf8'))
templates.test = handlebars.compile(fs.readFileSync(__dirname + '/test.handlebars', 'utf8'))

handlebars.registerHelper('gte', function(compare1, compare2, next) {
    if (!next) return '';

    if (compare1 >= compare2 && next.fn) {
        return next.fn(this);
    }
    if (next.inverse) {
        return next.inverse(this);
    }
    return '';
});

handlebars.registerHelper('percentage', function(value, total) {
    return Math.round(value / total * 100 * 100) / 100;
});

handlebars.registerHelper('rounded', function(value) {
    return Math.round(value);
});

handlebars.registerHelper('fromnow', function(time) {
    return moment(new Date(time)).fromNow();
});

handlebars.registerHelper('intime', function(time, add, unit) {
    return moment(new Date(time)).add(unit, add).fromNow();
});

handlebars.registerPartial('header', fs.readFileSync(__dirname + '/header.handlebars', 'utf8'));
handlebars.registerPartial('footer', fs.readFileSync(__dirname + '/footer.handlebars', 'utf8'));