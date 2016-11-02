var Parse =require('parse/node');

const SERVER_PORT = process.env.PORT || 3000;
const APP_ID = process.env.APP_ID || 'langrensha';
const MASTER_KEY = process.env.MASTER_KEY || '70c6093dba5a7e55968a1c7ad3dd3e5a74ef5cac';

Parse.initialize(APP_ID);
Parse.serverURL = `http://localhost:${SERVER_PORT}/parse`;
Parse.masterKey = MASTER_KEY;
Parse.Cloud.useMasterKey();

module.exports= Parse;