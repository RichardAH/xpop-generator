if (process.argv.length < 3)
{
    console.error("Usage: " +
        process.argv[0].replace(/.+\//, "") + " " + process.argv[1].replace(/.+\//,"") + " txn_hash")
    process.exit(1)
}

const txnid = process.argv[2]
const pov = require('./pov.js')
const Websocket = require('ws')

const pov_for_txn = (txnid)=>
{
    return new Promise((resolve, reject) =>
    {
        const ws = new Websocket('wss://xrplcluster.com')
        let stage = 1
        let ledger_index = -1
        let transactions = []
        let transactions_root = ''
        let proof = null
        ws.on('open', () =>
        {
            ws.send('{"command":"tx","transaction":"' + txnid + '"}')
        })

        ws.on('message', data =>
        {
            const json = JSON.parse(data)
            if (!json || !json.result)
            {
                console.error("error fetching txn")
                process.exit(2)
            }

            switch (stage)
            {
                case 1:
                    stage = 2
                    ledger_index = json.result.ledger_index
                    ws.send('{"command":"ledger", "ledger_index":"' + ledger_index + '",' +
                            ' "transactions":true, "expand":true, "binary":true, "accounts":false}')
                    return

                case 2:
                    transactions = json.result.ledger.transactions
                    proof = pov.create_proof(transactions, txnid)
                    console.log("merkle proof:")
                    console.log(proof)

                    stage = 3
                    ws.send('{"command":"ledger",  "ledger_index":"' + ledger_index + '"}')
                    return

                case 3:
                    let ledger = json.result.ledger
                    transactions_root = ledger.transaction_hash
                    console.log("reported txn root:", transactions_root)
                    let computed_transactions_root = pov.hash_proof(proof)
                    console.log("computed txn root:", computed_transactions_root)
                    let computed_ledger_hash = pov.hash_ledger(
                        ledger_index, ledger.total_coins,
                        ledger.parent_hash, computed_transactions_root, ledger.account_hash,
                        ledger.parent_close_time, ledger.close_time,
                        ledger.close_time_resolution,
                        ledger.close_flags)

                    console.log("reported lgr hash:", ledger.hash)
                    console.log("computed lgr hash:", computed_ledger_hash)
                    resolve(computed_ledger_hash == ledger.hash)
            }
        })
    })
}


pov_for_txn(txnid).then(v=>
{
    console.log("Verified proof:", v)
    process.exit(0)
})
