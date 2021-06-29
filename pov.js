const crypto = require('crypto')

const sha512h = b => 
{
    if (typeof(b) == 'string')
        b = Buffer.from(b, 'hex')
    return crypto.createHash('sha512').update(b).digest().slice(0, 32).toString('hex').toUpperCase()
}

const prefix_LWR = '4C575200'
const prefix_SND = '534E4400' 
const prefix_MIN = '4D494E00'
const prefix_TXN = '54584E00'

const numToHex = (n, size) =>
{ 
    if (typeof(n) != 'string')
        n = n.toString(16) 
    n = '0'.repeat((size*2)-n.length) + n
    return n
}

const compute_ledger_hash = 
(ledger_index, total_coins,
 parent_hash, transaction_hash, account_hash,
 parent_close_time, close_time, close_time_resolution, close_flags) =>
{
    if (typeof(parent_hash) != 'string')
        parent_hash = parent_hash.toString('hex')

    if (typeof(transaction_hash) != 'string')
        transaction_hash = transaction_hash.toString('hex')

    if (typeof(account_hash) != 'string')
        account_hash = account_hash.toString('hex')

    return crypto.createHash('sha512').update(
        Buffer.from(
            prefix_LWR +
            numToHex(ledger_index, 4) +
            numToHex(total_coins, 8) +
            parent_hash +
            transaction_hash +
            account_hash +
            numToHex(parent_close_time, 4) +
            numToHex(close_time, 4) +
            numToHex(close_time_resolution, 1) +
            numToHex(close_flags, 2))).digest().slice(0,32).toString('hex').toUpperCase()
}

const compute_merkle_hash = (tree, depth=0) =>
{
    const hex = {0:'0', 1:'1', 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7', 
                 8:'8', 9:'9',10:'A',11:'B',12:'C',13:'D',14:'E',15:'F'}

    const nullhash = '0'.repeat(64)

    let payload = prefix_MIN
    let hasher = crypto.createHash('sha512')
    hasher.update(Buffer.from(prefix_MIN, 'hex'))
    for (let i = 0; i < 16; ++i)
    {
        let nibble = hex[i]
        let to_append = ''
        if (tree.children[nibble] === undefined)
            to_append = nullhash
        else if (Object.keys(tree.children[nibble].children).length == 0)
            to_append = tree.children[nibble].hash
        else
            to_append = compute_merkle_hash(tree.children[nibble], depth+1)

        console.log('  '.repeat(depth) + i, to_append)
        
        payload += to_append
        hasher.update(Buffer.from(to_append, 'hex'))
    }

//    console.log('payload', payload)
    tree.hash = hasher.digest().slice(0,32).toString('hex').toUpperCase()
    //tree.hash = sha512h(payload)
    return tree.hash
}

const make_vl_bytes = len =>
{
    const report_error = e => { console.error(e) }
    if (typeof(len) != 'number')
    {
        report_error("non-numerical length passed to make_vl_bytes")
        return false
    }

    len = Math.ceil(len)

    if (len <= 192)
    {
        let b1 = len.toString(16)
        return (b1.length == 1 ? '0' + b1 : b1).toUpperCase()
    }
    else if (len <= 12480)
    {
        let b1 = Math.floor((len - 193) / 256 + 193)
        let b2 = len - 193 - 256 * (b1 - 193)
        b1 = b1.toString(16)
        b2 = b2.toString(16)
        return  ((b1.length == 1 ? '0' + b1 : b1) +
                 (b2.length == 1 ? '0' + b2 : b2)).toUpperCase()
    }
    else if (len <= 918744)
    {
        let b1 = Math.floor((len - 12481) / 65536 + 241)
        let b2 = Math.floor((len - 12481 - 65536 * (b1 - 241)) / 256)
        let b3 = len - 12481 - 65536 * (b1 - 241) - 256 * b2
        b1 = b1.toString(16)
        b2 = b2.toString(16)
        b3 = b3.toString(16)
        return  ((b1.length == 1 ? '0' + b1 : b1) +
                 (b2.length == 1 ? '0' + b2 : b2) +
                 (b3.length == 1 ? '0' + b3 : b3)).toUpperCase()
    }
    else
    {
        report_error("cannot generate vl for length = " + len + ", too large")
        return false
    }
}

const hash_txn = txn =>
{
    if (typeof(txn) != 'string')
        txn = txn.toString('hex')
    const hash = sha512h(prefix_TXN + txn)
    console.log('txnhash: ' + hash)
    return hash
}

const hash_txn_and_meta = (txn,meta) =>
{
    if (typeof(txn) != 'string')
        txn = txn.toString('hex')
    if (typeof(meta) != 'string')
        meta = meta.toString('hex')
    const vl1 = make_vl_bytes(txn.length/2)
    const vl2 = make_vl_bytes(meta.length/2)
    const payload = prefix_SND + vl1 + txn + vl2 + meta + hash_txn(txn)
    console.log('leaf:', payload) 
    return sha512h(payload)
}

const build_merkle_tree = txns => 
{
    const report_error = e => { console.error(e) }
    let root = {children: {}, hash: null, key: '0'.repeat(64)}

    // pass one: populate
    for (let k = 0; k < txns.length; ++k)
    {
        const txn  = txns[k].tx_blob
        const meta = txns[k].meta

        const hash = hash_txn(txn)
            //hash_txn_and_meta(txn, meta)

        console.log('hash', hash)
        let node = root
        let upto = 0

        let error = true
        while (upto < hash.length)
        {
            let nibble = hash[upto]

            console.log('txnid = ', k, 'nibble', hash.slice(0, upto+1), nibble)

            if (!(nibble in node.children))
            {
                node.children[nibble] = {
                    children: {},
                    hash: hash_txn_and_meta(txn, meta),
                    key : hash
                }
                error = false
                break
            }
            else if (Object.keys(node.children[nibble].children).length == 0)
            {
                // create a new node
                let oldnode = node.children[nibble]
                let newnibble = oldnode.key[upto+1]
                node.children[nibble] = {children: {}, hash: null, key: hash.slice(0,upto+1)}
                node.children[nibble].children[newnibble] = oldnode
                node = node.children[nibble]
                upto++
                continue
            }
            else
            {
                node = node.children[nibble]
                upto++
                continue
            }
        }

        if (error)
        {
            report_error(error)
            return false
        }
    }

    // pass two: recursively compute hashes
    compute_merkle_hash(root)

    return root
}

const fs = require('fs')
const result = JSON.parse(fs.readFileSync('example').toString('utf-8'))
const txns = result.result.ledger.transactions
console.log(JSON.stringify(build_merkle_tree(txns), " ", 2))
