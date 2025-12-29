"use strict";
import express from 'express';
import tomlParser from 'toml';
import fileSystem from 'fs';
import createDebug from 'debug';
import {Pool as PgPool, Client as PgClient} from 'pg';
import {createClient} from 'redis';
import expressLayouts from 'express-ejs-layouts';
import exSession from 'express-session';
import {RedisStore} from 'connect-redis';

import {RDBMSPooling} from './models/RDBMSPooling.js';

globalThis.defObj = tomlParser.parse(fileSystem.readFileSync('./config/def.toml'));

const PORT = 3000;
const app = express();

const debug_gen = createDebug('wbapp:gen');
const debug_io  = createDebug('wbapp:io');
const debug_net = createDebug('wbapp:net');

/*
    ルーティング処理前に実行されるミドルウェアs
*/

// RDBMS コネクションプーリング
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
app.use((req, res, next) => {
    const rdb = new RDBMSPooling({
         "db":  globalThis.defObj.rdbms.db
        ,"log": globalThis.defObj.rdbms.log
        ,"debug_io": debug_io
    }, pgPoolInstance);

   res.locals.rdb = rdb;
   next();
});

// セッション
    const redis = createClient({
        url: `redis://${globalThis.defObj.redis.host}:${globalThis.defObj.redis.port}/${globalThis.defObj.redis.dbNo}`
    });
    redis.connect().catch(console.error);
    const redisStore = new RedisStore({ client: redis, prefix: "WEBSESSID:"});
    app.use(exSession({
        store: redisStore,
        resave: false,
        saveUninitialized: false,
        secret: 'mKx3ABGUh4',
    }));

// POST form
app.use(express.urlencoded( {extended: true}));

// ejs
app.set('view engine', 'ejs');
app.use(expressLayouts);

/**
 * ルーティング
 */
app.get('/', async (req, res) => {
    const errArr = [], nowDate = new Date(), sessObj = {};
    let dbVal, retStr, access_num = 0;

    let dateStr = '' + nowDate.getFullYear();
    dateStr += '-' + ( '' + (nowDate.getMonth() + 1) ).padStart(2, '0');
    dateStr += '-' + ( '' + nowDate.getDate() ).padStart(2, '0');
    dateStr += ' ' + ( '' + nowDate.getHours() ).padStart(2, '0');
    dateStr += ':' + ( '' + nowDate.getMinutes() ).padStart(2, '0');
    dateStr += ':' + ( '' + nowDate.getSeconds() ).padStart(2, '0');
    console.log(`request comming ${dateStr}`);
    try {
        let sql = `SELECT user_id, name, email
                   FROM LoginUsers
                   ORDER by user_id DESC`;
        dbVal = await res.locals.rdb.run(sql, []);
        access_num = await redis.incr('access_counter');
    } catch(err){
        errArr.push(err.message);
    } finally {
        res.locals.rdb.end();
    }

    // セッション
    if( req.session && req.session.local && req.session.local.counter){
        sessObj['counter']   = req.session.local.counter + 1;
        sessObj['user_name'] = req.session.local.user_name;
    } else {
        sessObj['counter']   = 1;
        sessObj['user_name'] = 'alice';
    }
    req.session.local = sessObj;

    // レンダリング
    const args = {};
    args.errMsg    = errArr.join("\n");
    args.pageTitle = 'Docker Compose 確認';
    args.layout    = 'layouts/layout_general.ejs';
    args.data      = { dateStr: dateStr, dbVal: dbVal, access_num: access_num, session: req.session.local }
    res.render('pages/index.ejs', args)
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

/**
 * アクセス数増加
 */
app.post('/access', express.json(), async(req, res) => {
    const errArr = [];
    let incrBy = 1;

    if( req.body && req.body['incrBy'] && Number.isInteger(req.body['incrBy']) ){
        incrBy = Number.parseInt(req.body['incrBy'], 10);
    }

    try {
        await redis.incrby('access_counter', incrBy);
    } catch(err){
        errArr.push(err.message);
    }
    
    const out = {};
    if(errArr.length){
        out['errArr'] = errArr;
    } else {
        out['incrBy'] = incrBy;
    }
    res.json(out);
});

app.listen(PORT, () => {
    console.log(`Server running at localhost:${PORT} dev = ${globalThis.defObj.dev}, admin_cid = ${globalThis.defObj.cache.admin_cid} on ${new Date().toLocaleTimeString()}`);
});