const crypto = require('crypto')

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
const hex = {0:'0', 1:'1', 2:'2', 3:'3', 4:'4', 5:'5', 6:'6', 7:'7',
             8:'8', 9:'9',10:'A',11:'B',12:'C',13:'D',14:'E',15:'F'}

const numToHex = (n, size) =>
{
    if (typeof(n) != 'string')
        n = n.toString(16)
    n = '0'.repeat((size*2)-n.length) + n
    return n
}

const hash_ledger =
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

    if (typeof(ledger_index) == 'string')
        ledger_index = BigInt(ledger_index)

    if (typeof(total_coins) == 'string')
        total_coins = BigInt(total_coins)

    if (typeof(parent_close_time) == 'string')
        parent_close_time = BigInt(parent_close_time)

    if (typeof(close_time) == 'string')
        close_time = BigInt(close_time)

    if (typeof(close_time_resolution) == 'string')
        close_time_resolution = BigInt(close_time_resolution)

    if (typeof(close_flags) == 'string')
        close_flags = BigInt(close_flags)

    const payload =
            prefix_LWR + 
            numToHex(ledger_index, 4) + 
            numToHex(total_coins, 8) + 
            parent_hash + 
            transaction_hash + 
            account_hash + 
            numToHex(parent_close_time, 4) + 
            numToHex(close_time, 4) + 
            numToHex(close_time_resolution, 1) + 
            numToHex(close_flags, 1).toUpperCase()

    return crypto.createHash('sha512').
           update(Buffer.from(payload, 'hex')).
           digest().
           slice(0,32).
           toString('hex').
           toUpperCase()
}

const compute_tree = (tree, depth=0) =>
{

    const nullhash = '0'.repeat(64)

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
            to_append = compute_tree(tree.children[nibble], depth+1)

        hasher.update(Buffer.from(to_append, 'hex'))
    }

    tree.hash = hasher.digest().slice(0,32).toString('hex').toUpperCase()
    return tree.hash
}


const hash_txn = txn =>
{
    if (typeof(txn) != 'string')
        txn = txn.toString('hex')
    return sha512h(prefix_TXN + txn)
}

const hash_txn_and_meta = (txn, meta) =>
{
    if (typeof(txn) != 'string')
        txn = txn.toString('hex')
    if (typeof(meta) != 'string')
        meta = meta.toString('hex')
    const vl1 = make_vl_bytes(txn.length/2)
    const vl2 = make_vl_bytes(meta.length/2)
    return sha512h(prefix_SND + vl1 + txn + vl2 + meta + hash_txn(txn))
}

const report_error = e =>
{
    throw(e)
    //console.error(e)
}

const create_tree = txns =>
{
    let root = {children: {}, hash: null, key: '0'.repeat(64)}

    // pass one: populate
    for (let k = 0; k < txns.length; ++k)
    {
        const txn  = txns[k].tx_blob
        const meta = txns[k].meta

        const hash = hash_txn(txn)

        let node = root
        let upto = 0

        let error = true
        while (upto < hash.length)
        {
            let nibble = hash[upto]

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
    compute_tree(root)

    return root
}

// generate the proof
// pass valid merkle tree and the canonical txn hash as key
const create_proof_from_tree = (tree, key, upto = 0) =>
{
    if (tree === undefined)
        return false

    tree = tree.children

    if (tree === undefined)
        return false

    let proof = []

    let n = parseInt(key[upto], 16)

    for (let i = 0; i < 16; ++i)
    {
        const h = hex[i]
        if (i == n)
        {
            if (tree[h] === undefined)
                return false
            else if (tree[h].key == key)
                proof.push(tree[h].hash)
            else
            {
                let retval = create_proof_from_tree(tree[h], key, upto+1)
                if (!retval)
                    return false
                proof.push(retval)
            }
        }
        else if (tree[h] === undefined)
            proof.push('0'.repeat(64))
        else
            proof.push(tree[h].hash)
    }
    return proof
}

const create_proof = (txns, key) =>
{
    const tree = create_tree(txns)
    if (!tree)
        return false
    return create_proof_from_tree(tree, key, 0)
}

const hash_proof = (proof) =>
{
    if (proof === undefined)
        return false

    let hasher = crypto.createHash('sha512')
    hasher.update(Buffer.from(prefix_MIN, 'hex'))
    for (let i = 0; i < 16; ++i)
    {
        if (proof[i] === undefined)
            return false
        else if (typeof(proof[i]) == 'string')
            hasher.update(Buffer.from(proof[i], 'hex'))
        else
            hasher.update(Buffer.from(hash_proof(proof[i]), 'hex'))
    }
    return hasher.digest().slice(0,32).toString('hex').toUpperCase()
}

const verify_proof = (root_hash, proof) =>
{
    if (typeof(root_hash) != 'string' || typeof(proof) != 'object')
        return false

    return root_hash.toUpperCase() == hash_proof(proof)
}

const proof_contains = (proof, tx_blob, meta, already_computed = false) =>
{
    if (proof === undefined)
        return false

    const hash = (already_computed ? already_computed : hash_txn_and_meta(tx_blob, meta))

    for (let i = 0; i < 16; ++i)
    {
        if (proof[i] === undefined)
            return false

        if (proof[i] == hash)
            return true

        if (typeof(proof[i]) == 'object' && proof_contains(proof[i], null, null, hash))
            return true
    }

    return false
}

module.exports = {
    hash_ledger: hash_ledger,
    hash_txn: hash_txn,
    hash_txn_and_meta: hash_txn_and_meta,
    hash_proof: hash_proof,
    create_proof: create_proof,
    verify_proof: verify_proof,
    proof_contains: proof_contains
}
