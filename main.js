const wsendpoint = 'wss://xrplcluster.com'
const port = 8080
const express = require('express')
const app = express()
const pov = require('./pov.js')
const Websocket = require('ws')
const { Pool } = require('pg')
const fs = require('fs')
const child_process = require("child_process")
const {fetch_validated_unl} = require('./fetch.js')
const brotli = require('brotli')
const yenc = require('yencode') 

let vl = {_last_fetched: 0}

const update_vl = ()=>{
    return new Promise((resolve, reject) =>
    {
        let now = Math.floor(Date.now()/1000)
        if (now - vl._last_fetched > 600)
        {
            fetch_validated_unl('https://vl.xrplf.org/').then(
            fetched => {
                vl._last_fetched = now
                for (k in fetched)
                    vl[k] = fetched[k]
                resolve()
            }).catch(e =>{reject(e)})
        }
        else
            resolve()
    })
}


const pov_for_txn = (txnid, vl)=>
{
    return new Promise((resolve, reject) =>
    {
        const ws = new Websocket(wsendpoint)
        let stage = 1
        let ledger_index = -1
        let transactions = []
        let transactions_root = ''
        let txbin = ''
        let metabin = ''
        let proof = null
        let done = false
        ws.on('open', () =>
        {
            ws.send('{"command":"tx","binary":true,"transaction":"' + txnid + '"}')
        })

        ws.on('error', (e)=>
        {
            if (!done)
                reject(e)
        })

        ws.on('close', ()=>
        {
            if (!done)
                reject('ws closed')
        })

        ws.on('message', data =>
        {
            const json = JSON.parse(data)
            if (!json || !json.result)
            {
                console.error("error fetching txn")
                return false
            }
            
            switch (stage)
            {
                case 1:
                    
                    stage = 2
                    ledger_index = json.result.ledger_index
                    txbin = json.result.tx
                    metabin = json.result.meta
                    ws.send('{"command":"ledger", "ledger_index":"' + ledger_index + '",' +
                            ' "transactions":true, "expand":true, "binary":true, "accounts":false}')
                    return

                case 2:
                    transactions = json.result.ledger.transactions
                    proof = pov.create_proof(transactions, txnid)
                    stage = 3
                    ws.send('{"command":"ledger",  "ledger_index":"' + ledger_index + '"}')
                    return

                case 3:
                    let ledger = json.result.ledger
                    transactions_root = ledger.transaction_hash
                    let computed_transactions_root = pov.hash_proof(proof)
                    let computed_ledger_hash = pov.hash_ledger(
                        ledger_index, ledger.total_coins,
                        ledger.parent_hash, computed_transactions_root, ledger.account_hash,
                        ledger.parent_close_time, ledger.close_time,
                        ledger.close_time_resolution,
                        ledger.close_flags)

                    if(computed_ledger_hash == ledger.hash)
                    {
                        ws.close()
                        done = true
                        resolve({
                            ledger: {
                                index: ledger_index,
                                coins: ledger.total_coins,
                                phash: ledger.parent_hash,
                                txroot: computed_transactions_root,
                                acroot: ledger.account_hash,
                                pclose: ledger.parent_close_time,
                                close: ledger.close_time,
                                cres: ledger.close_time_resolution,
                                flags: ledger.close_flags
                            },
                            validation: {data: {}, unl: {}},
                            transaction: {
                                blob: txbin,
                                meta: metabin,
                                proof: proof
                            }
                        });
                    }
            }
        })
    })
}

let config = {}
try
{
    config = JSON.parse(fs.readFileSync(process.env['HOME'] + '/.valcol'))
}
catch (e)
{
    console.error("Failed to read psql credentials from ~/.valcol")
    console.error(e)
    console.error("Expecting:")
    console.error('{')
    console.error('\t"user": "validation_user",')
    console.error('\t"host": "...",')
    console.error('\t"database": "...",')
    console.error('\t"password": "...",')
    console.error('\t"port": 1234')
    console.error('}')
    process.exit(1)
}

const pool = new Pool(config)

app.get('/:txnid', (req, res) => {

    const fail = ((res)=>{
        return (e)=>
        {
            return res.status(500).send('Validations database error: ' + e)
        }
    })(res)

    const txnid = req.params.txnid.toString().toUpperCase()

    if (txnid.match(/^[A-F0-9]+$/) == null)
        return res.status(400).send('Invalid transaction hash')

    update_vl().then(()=>
    {
        pov_for_txn(txnid).then(output =>
        {

            pool.connect((err, psql, release) => {
                if (err) 
                    return fail('could not connect')
                    
                const params = [output.ledger.index, Object.keys(vl.unl)]
                psql.query("SELECT pubkey, data FROM validations WHERE ledger = $1 AND pubkey = ANY($2);", params).then(
                (query) =>
                {
                    release()
                    if (!query.rows || query.rows.length < Math.ceil(params[1].length * 0.8))
                        return fail('validations not present')
                    
                    query.rows.forEach(row =>
                    {
                        output.validation.data[row.pubkey] = row.data.toString('hex')
                    })
                    output.validation.unl = vl.vl 
                    if (req.query.gif === undefined && req.query.gifcomp === undefined)
                        return res.status(200).send(JSON.stringify(output, null, 2))
                
                    // gif logic
                    //
                    //
                    let gifpayload = JSON.stringify(output)
                    if (req.query.gifcomp !== undefined)
                    {
                        gifpayload = brotli.compress(gifpayload, true)
                        gifpayload = yenc.encode(gifpayload, 0xFFFFF)
                    }

                    return res.status(200).send(
                        '<html><head>' +
                        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
                        '<style>img {' +
                        '	image-rendering: pixelated;' +
                        '}' +
                        'body {' +
                        '  margin: 0;' +
                        '	padding:1em;' +
                        '}' +
                        '</style></head>' +
                        '<body><center><img src="data:image/gif;base64,' +
                        child_process.execFileSync('./aqg', [], 
                        {
                            input: gifpayload
                        }).toString('base64') +
                        '"></center></body>')
                }).catch( e=> {
                    try {release()} catch (ee) {}
                    console.log(e)
                    return fail('query failed')
                })
            })
        }).catch( e=> {
            console.log(e)
            return fail('txn fetch failed')
        })
    }).catch( e=> {
        console.log(e)
        return fail('could not fetch vl')
    })
})
update_vl().then(()=>
{
    app.listen(port, '0.0.0.0', 1024, () => {
      console.log(`POV Listening at http://0.0.0.0:${port}/:txnid`)
    })
}).catch(e => { console.log(e) } );
