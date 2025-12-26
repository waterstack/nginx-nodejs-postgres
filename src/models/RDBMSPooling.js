'use strict';

class RDBMSPooling{
    /*
        DBクライアントの設定
    */
    constructor(conf, pgPool){
        if( conf.db === 'postgresql'){
            this.type         = conf.db;
            this.log          = conf.log;
            this.debug_io     = conf.debug_io;
            this.startTxFlag  = false;
            this.runCounter   = 0;
            this.isConnected  = false;
            this.pool         = pgPool;
        } else {
            throw new Error('no available db');
        }
    }

    /*
        SQL実行
    */
    async run(sql, bindVals, output = false){
        let retVal;
        if( this.type === 'postgresql'){
            //接続開始
            if( this.isConnected === false ){
                this.client = await this.connect();
            }

            //トランザクション開始
            if( this.startTxFlag && this.runCounter === 0 ){
                this.runCounter++;
                if( this.log ){
                    this.debug_io("[SQL_LOG]: BEGIN");
                }
                await this.client.query({ text: 'BEGIN' ,values: [] })
            }


            //ログ出力 Utility.sqlLogと同一であるが、モジュールを読み込まないで実行したいため直接記述
            if( this.log || output){
                let log = sql.replace(/\s+/g, ' ');

                let counter = 1;
                for( let val of bindVals ){
                    //replace
                    let replace = '';
                    if( typeof val === 'string' ){
                        replace = "'" + val + "'";
                    } else {
                        replace = "" + val;
                    }
                    log = log.replace('$' + counter, replace);
                    counter++;
                }
                this.debug_io("[SQL_LOG]: " + log);
            }

            //SQL実行
            this.runCounter++;
            retVal = this.client.query({ text: sql ,values: bindVals });
        }

        return retVal;
    }

    /*
        接続
    */
   async connect(){
        this.isConnected = true;

        //ログ出力
        if( this.log ){
            this.debug_io("[SQL_LOG]: connect()");
        }

        return this.pool.connect();
   }

   /*
        終了(エイリアス)
    */
    async end(){
        return this.release();
    }

   /*
        終了
    */
    async release(){
        if( this.client && typeof this.client.release === 'function' ){
            this.client.release();
            this.isConnected = false;
            this.startTxFlag = false;
            this.runCounter = 0;

            //ログ出力
            if( this.log ){
                this.debug_io("[SQL_LOG]: release");
            }
        }
        return true;
    }

    /*
        トランザクション開始（遅延実行）
    */
    begin(){
        this.startTxFlag = true;
        this.runCounter = 0;
    }

    /*
        トランザクションロールバック
    */
    async rollback(){
        if( this.startTxFlag && this.runCounter > 0 ){
            if( this.log ){
                this.debug_io('[SQL_LOG]: RUN ROLLBACK');
            }
            await this.client.query({ text: 'ROLLBACK' ,values: [] });
        }

        this.startTxFlag = false;
        this.runCounter = 0;
        this.debug_io('[SQL_LOG]: ROLLBACK flag down');

        return true;
    }

    /*
        トランザクションコミット
    */
    async commit(){
        if( this.startTxFlag && this.runCounter > 0 ){
            if( this.log ){
                this.debug_io('[SQL_LOG]: RUN COMMIT');
            }
            await this.client.query({ text: 'COMMIT' ,values: [] });
        }

        this.startTxFlag = false;
        this.runCounter = 0;
        this.debug_io('[SQL_LOG]: COMMIT flag down');

        return true;
    }

    /**
     * ログ出力OFF
     */
    logOff(memo = ''){
        this.log = false;
        console.log(`RDBMSPooling.logOff(), memo = ${memo}`)
    }

    /**
     * ログ出力ON
     */
    logOn(memo = ''){
        this.log = true;
        console.log(`RDBMSPooling.logOn(), memo = ${memo}`)
    }
}
export {
    RDBMSPooling
}
