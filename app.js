var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

import usersRouter from './routes/users';
import matchMakingRouter from './routes/matchmaking';

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

import parseRequest from 'parse-request';
app.use(function (req, res, next) {
  const parsedReq = parseRequest({ req, parseQuery: true });
  var params = {};
  params = Object.assign({}, params, parsedReq.request.query);
  if (parsedReq.request.method !== 'GET') {
    params = Object.assign({}, params, JSON.parse(parsedReq.request.body));
  }
  req.parsedParams = params;
  next();
});

app.use('/users', usersRouter);
app.use('/matchmaking', matchMakingRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // console.log(arguments);
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  if (err.status === 404) {
    res.sendStatus(404);
  } else {
    res.send('error');
  }
});

module.exports = app;
