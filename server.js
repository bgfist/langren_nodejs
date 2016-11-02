
var _ = require('lodash');
var express = require('express');
var path = require('path');
var app = express();
var ParseServer = require('parse-server').ParseServer;
var ParseDashboard = require('parse-dashboard');

//parse
const SERVER_PORT = process.env.PORT || 3000;
const SERVER_HOST = process.env.HOST || '0.0.0.0';
const APP_ID = process.env.APP_ID || 'langrensha';
const MASTER_KEY = process.env.MASTER_KEY || '70c6093dba5a7e55968a1c7ad3dd3e5a74ef5cac';
const DATABASE_URI = process.env.DATABASE_URI || 'mongodb://localhost:27017/langrensha';
const IS_DEVELOPMENT = process.env.NODE_ENV !== 'production';
const DASHBOARD_AUTH = process.env.DASHBOARD_AUTH || 'jack:12345678';

app.all('/parse', function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  res.header("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
  res.header("X-Powered-By", ' 3.2.1')
  res.header("Content-Type", "application/json;charset=utf-8");
  next();
});

app.use('/test', function (req, res, next) {
  res.send('test');
})

app.use(
  '/parse',
  new ParseServer({
    databaseURI: DATABASE_URI,
    cloud: path.resolve(__dirname, 'parse/cloud.js'),
    appId: APP_ID,
    masterKey: MASTER_KEY,
    serverURL: `http://${SERVER_HOST}:${SERVER_PORT}/parse`, 
  })
);





//development 
if (IS_DEVELOPMENT) {
  let users;
  if (DASHBOARD_AUTH) {
    var [user, pass] = DASHBOARD_AUTH.split(':');
    users = [{ user, pass }];
    console.log('development mode: your auth is  ');
    console.log(users);
  }
  app.use('/dashboard',
    ParseDashboard({
      apps: [{
        serverURL: '/parse',
        appId: APP_ID,
        masterKey: MASTER_KEY,
        appName: '狼人杀',
      }],
      users,
    }, IS_DEVELOPMENT));
}

app.use(express.static(path.join(__dirname + "/public")))





var server = app.listen(SERVER_PORT, function () {
  console.log(`parse-server-example running on ${SERVER_HOST}:${SERVER_PORT}`);
});

var startSocketServer = require('./socket');

startSocketServer(server);