const websocket = require('ws')
const rac = require('ripple-address-codec')
const wsurl = process.env['wss']
if (wsurl === undefined)
{
    console.error("please define a websocket endpoint using environmental variable `wss`")
    process.exit(1)
}
require('../xrpl-fetch-unl/fetch.js').fetch_validated_unl('https://vl.xrplf.org').then(unl =>
{
    const ws = new websocket(wsurl)

    console.log(unl)

    const quorum = Math.ceil(Object.keys(unl).length * 0.8)
    let votes = {}
    let largest_seq = 0

    ws.on('open', () =>
    {
        ws.send('{"command": "subscribe", "streams": ["validations"]}')
    })
    ws.on('message', raw =>
    {
        try
        {
            const json = JSON.parse(raw)
            const key = json.validation_public_key
            if (unl[key] !== undefined)
            {
                const val =
                    unl[key].verify_validation(json.data)

                if (!val._verified)
                    return

                const seq = 
                    val['LedgerSequence']

                const hash = 
                    val['LedgerHash']

                if (votes[seq] === undefined)
                    votes[seq] = {}

                if (votes[seq][hash] === undefined)
                    votes[seq][hash] = {}
                
                votes[seq][hash][key] = json.data


                let block = ""
                if (Object.keys(votes[seq][hash]).length == quorum)
                {
                    console.log("Quorum achieved on: " + seq + " == " + hash)
                    
                    for (k in votes[seq][hash])
                        block += votes[seq][hash][k]
                }

                console.log(block)


            }
        }
        catch(e)
        {
            console.error("Error: ", e)
            process.exit(1)
        }
    })
}).catch(e =>
{
    console.error("Error: ", e)
    process.exit(1)
})
