"use strict";
import express from 'express';
import tomlParser from 'toml';
import fileSystem from 'fs';
import createDebug from 'debug';
import {Pool as PgPool, Client as PgClient}from 'pg';
import {RDBMSPooling} from './models/RDBMSPooling.js';
const PORT = 3000;
const app = express();

const debug_gen = createDebug('wbapp:gen');
const debug_io  = createDebug('wbapp:io');
const debug_net = createDebug('wbapp:net');


globalThis.defObj = tomlParser.parse(fileSystem.readFileSync('./src/config/def.toml'));
console.log('defObj', defObj);


/*
    RDBMS コネクションプーリング
*/
const pgPoolInstance = new PgPool({
     user: globalThis.defObj.rdbms.user
    ,host: globalThis.defObj.rdbms.host
    ,database: globalThis.defObj.rdbms.database
    ,password: globalThis.defObj.rdbms.password
    ,port: globalThis.defObj.rdbms.port
    ,max: 50
    ,idleTimeoutMillis: 20000
    ,connectionTimeoutMillis: 3000
});

/*
    ルーティング処理前に実行されるミドルウェア
*/
app.use((req, res, next) => {
    const rdb = new RDBMSPooling({
         "db":  globalThis.defObj.rdbms.db
        ,"log": globalThis.defObj.rdbms.log
        ,"debug_io": debug_io
    }, pgPoolInstance);

   res.locals.rdb = rdb;
   next();
});

app.use(express.urlencoded( {extended: true}));

app.get('/', async (req, res) => {
    const errArr = [], nowDate = new Date();
    let dbVal, retStr;

    console.log('request comming', req.query && req.query['cid'] );
    try {
        let sql = `SELECT user_id, name, email
                   FROM LoginUsers
                   ORDER by user_id DESC`;
        dbVal = await res.locals.rdb.run(sql, []);
    } catch(err){
        errArr.push(err.message);
    } finally {
        res.locals.rdb.end();
    }

    // retStr
    if( errArr.length === 0 ){
        retStr = `<div>Hello from express (ESM) 2025-12-26 14:49 !</div>
                    <div>${nowDate.getFullYear()}-${nowDate.getMonth() + 1}-${nowDate.getDate()} ${nowDate.getHours()}:${nowDate.getMinutes()}:${nowDate.getSeconds()}</div>
                    <div>`;
    
        for(const row of dbVal.rows){
            retStr+= `<div>${row['user_id']} / ${row['name']} / ${row['email']}</div>`;
        }
        retStr+= '</div>';
    }

    let outStr = '';
    if( errArr.length ){
        outStr+= errArr.join(',');
    } else {
        outStr+= retStr;
    }
    res.send(outStr);
});

app.post('/users', express.json(), async (req, res) => {
    const errArr = [];
    let name, email, user_id;
    console.log(req.body);

    // name
    if( req.body['name']){
        name = req.body['name'].trim();
    } else {
        errArr.push('name is not supplied');
    }

    // email
    if( req.body['email']){
        email = req.body['email'].trim();
    } else {
        errArr.push('email is not supplied');
    }

    if( errArr.length === 0){
        try {
            let sql, bindVals = [], pcnt = 1;
            sql = `INSERT INTO LoginUsers(
                    name, email
                ) VALUES (
                    $${pcnt++}, $${pcnt++}
                ) RETURNING user_id`;
                bindVals.push(name, email)

            // run sql
            const dbVal = await res.locals.rdb.run(sql, bindVals);
            if( dbVal.rows && dbVal.rows.length ){
                user_id = dbVal.rows[0].user_id;
            } else {
                errArr.push('db error');
            }
        } catch(err){
            errArr.push(err.message);
        } finally {
            res.locals.rdb.end();
        }
    }

    const out = {};
    if( errArr.length){
        out['errArr'] = errArr;
    } else {
        out['user_id'] = user_id;
    }
    res.json(out);
});

app.listen(PORT, () => {
    console.log(`Server running at localhost:${PORT} on ${new Date().toLocaleTimeString()}`);
});

