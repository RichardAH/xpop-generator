if (process.argv.length < 3)
{
    console.error("Usage: " + process.argv[0].replace(/.+\//, "") + " " + process.argv[1].replace(/.+\//,"") + " txn_hash")
    process.exit(1)
}

const txnid = process.argv[2]
const pov = require('./pov.js')
const Websocket = require('ws')

const pov_for_txn = (txnid)=>
{
    return new Promise((resolve, reject) =>
    {
        const ws = new Websocket('wss://xrpl.ws')
        let stage = 1
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
                    ws.send('{"command":"ledger", "ledger_index":"' + json.result.ledger_index + '",' +
                            ' "transactions":true, "expand":true, "binary":true, "accounts":false}')
                    return
                    
                case 2:
                    transactions = json.result.ledger.transactions
                    proof = pov.create_proof(transactions, txnid)
                    console.log("proof:", proof)

                    stage = 3
                    ws.send('{"command":"ledger",  "ledger_index":"' + json.result.ledger_index + '"}')
                    return

                case 3:
                    transactions_root = json.result.ledger.transaction_hash
                    console.log("ledger's transactions_root:", transactions_root)
                    let hash_proof = pov.hash_proof(proof)
                    console.log("hash of proof:", hash_proof)
                    resolve(hash_proof == transactions_root)
            }
        })
    })
}


pov_for_txn(txnid).then((v)=>console.log("Verified proof:", v))
