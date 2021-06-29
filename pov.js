const crypto = require('crypto')

const compute_merkle_hash = (tree, inner_prefix, leaf_prefix) =>
{
    const nullhash = Buffer.from('0'.repeat(64), 'hex')
    const hex = {0:0,1:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:'A',11:'B',12:'C',13:'D',14:'E',15:'F'}
    let hasher = crypto.createHash('sha512')
    for (let i = 0; i < 16; ++i)
    {
        let nibble = hex[i]
        if (tree.children[nibble] === undefined)
            hasher.update(nullhash)
        else if (typeof(tree.children[nibble]) == 'string')
            hasher.update(Buffer.from(tree.children[nibble], 'hex'))
        else
            hasher.update(compute_merkle_hash(tree.children[nibble]))
    }
    tree.hash = hasher.digest().toString('hex').toUpperCase()
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
        return b1.length == 1 ? '0' + b1 : b1
    }
    else if (len <= 12480)
    {
        let b1 = Math.floor((len - 193) / 256 + 193)
        let b2 = len - 193 - 256 * (b1 - 193)
        b1 = b1.toString(16)
        b2 = b2.toString(16)
        return  (b1.length == 1 ? '0' + b1 : b1) +
                (b2.length == 1 ? '0' + b2 : b2)
    }
    else if (len <= 918744)
    {
        let b1 = Math.floor((len - 12481) / 65536 + 241)
        let b2 = Math.floor((len - 12481 - 65536 * (b1 - 241)) / 256)
        let b3 = len - 12481 - 65536 * (b1 - 241) - 256 * b2
        b1 = b1.toString(16)
        b2 = b2.toString(16)
        b3 = b3.toString(16)
        return  (b1.length == 1 ? '0' + b1 : b1) +
                (b2.length == 1 ? '0' + b2 : b2) +
                (b3.length == 1 ? '0' + b3 : b3)
    }
    else
    {
        report_error("cannot generate vl for length = " + len + ", too large")
        return false
    }
}

const hash_txn_and_meta = (txn,meta) =>
{
    
}

const build_merkle_tree = txns => 
{
    const report_error = e => { console.error(e) }
    let root = {children: {}, hash: null}

    // pass one: populate
    for (let k = 0; k < txns.length; ++k)
    {
        let node = root
        let upto = 0
        let hash = txns[k].toUpperCase()

        let error = true
        while (upto < hash.length)
        {
            let nibble = hash[upto]

            if (!(nibble in node.children))
            {
                node.children[nibble] = hash
                error = false
                break
            }
            else if (typeof(node.children[nibble]) == 'string')
            {
                // create a new node
                let oldhash = node.children[nibble]
                let newnibble = oldhash[upto+1]
                node.children[nibble] = {children: {}, hash: null}
                node.children[nibble].children[newnibble] = oldhash
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
console.log(txns)
//RH UPTO change merkle tree to sha512(node_prefix + vl1 + tx_blob + vl2 + meta + shamapkey)
//console.log(build_merkle_tree(txns))
