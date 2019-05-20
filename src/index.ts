import express from 'express'
import { SERVER_PORT, SERVER_HOST } from './config/server'
import { startControl } from './network/controller'

const app = express();

const server = app.listen(SERVER_PORT, function () {
  console.log(`parse-server-example running on ${SERVER_HOST}:${SERVER_PORT}`);
  startControl();
});
