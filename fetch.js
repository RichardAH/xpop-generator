const elliptic = require('elliptic')
const secp256k1 = new elliptic.ec('secp256k1')
const ed25519 = new elliptic.eddsa('ed25519')
const crypto = require('crypto')
const https = require('https')

const fetch_validated_unl = (url, master_public_key = false) =>
{
    return new Promise((resolve, reject) =>
    {
        // RH TODO: implement minimal subsets of these libraries directly to reduce dependencies
        const codec =
        {
            address: require('ripple-address-codec')
        }

        const assert = (c,m) =>
        {
            if (!c)
                reject("Invalid manifest: " + (m ? m : ""));
        }

        const parse_manifest = (buf) =>
        {
            let man = {};
            let upto = 0;

            let verify_fields = [Buffer.from('MAN\x00', 'utf-8')];
            let last_signing = 0;

            // sequence number
            assert(buf[upto++] == 0x24, "Missing Sequence Number")
            man['Sequence'] = (buf[upto] << 24) + (buf[upto+1] << 16) + (buf[upto+2] << 8) + buf[upto+3]
            upto += 4

            // public key
            assert(buf[upto++] == 0x71, "Missing Public Key")       // type 7 = VL, 1 = PublicKey
            assert(buf[upto++] == 33, "Missing Public Key size")    // one byte size
            man['PublicKey'] = buf.slice(upto, upto + 33).toString('hex')
            upto += 33

            // signing public key
            assert(buf[upto++] == 0x73, "Missing Signing Public Key")       // type 7 = VL, 3 = SigningPubKey
            assert(buf[upto++] == 33, "Missing Signing Public Key size")    // one byte size
            man['SigningPubKey'] = buf.slice(upto, upto + 33).toString('hex')
            upto += 33

            // signature
            verify_fields.push(buf.slice(last_signing, upto))
            assert(buf[upto++] == 0x76, "Missing Signature")    // type 7 = VL, 6 = Signature
            let signature_size = buf[upto++];
            man['Signature'] = buf.slice(upto, upto + signature_size).toString('hex')
            upto += signature_size
            last_signing = upto

            // domain field | optional
            if (buf[upto] == 0x77)
            {
                upto++
                let domain_size = buf[upto++]
                man['Domain'] = buf.slice(upto, upto + domain_size).toString('utf-8')
                upto += domain_size
            }

            // master signature
            verify_fields.push(buf.slice(last_signing, upto))
            assert(buf[upto++] == 0x70, "Missing Master Signature lead byte")   // type 7 = VL, 0 = uncommon field
            assert(buf[upto++] == 0x12, "Missing Master Signature follow byte") // un field = 0x12 master signature
            let master_size = buf[upto++];
            man['MasterSignature'] = buf.slice(upto, upto + master_size).toString('hex')
            upto += master_size
            last_signing = upto // here in case more fields ever added below

            assert(upto == buf.length, "Extra bytes after end of manifest")

            // for signature verification
            man.without_signing_fields = Buffer.concat(verify_fields)
            return man;
        }

        https.get(url, res =>
        {
            let data = ''
            res.on('data', chunk =>
            {
                data += chunk
            })
            res.on('end', ()=>
            {
                try
                {
                    json = JSON.parse(data)

                    // initial json validation
                    assert(json.public_key !== undefined, "public key missing from vl")
                    assert(json.signature !== undefined, "signature missing from vl")
                    assert(json.version !== undefined, "version missing from vl")
                    assert(json.manifest !== undefined, "manifest missing from vl")
                    assert(json.blob !== undefined, "blob missing from vl")
                    assert(json.version == 1, "vl version != 1")

                    // check key is recognised
                    if (master_public_key !== false)
                        assert(json.public_key.toUpperCase() == master_public_key.toUpperCase(),
                            "Provided VL key does not match")
                    else
                        master_public_key = json.public_key.toUpperCase()

                    // parse blob
                    let blob = Buffer.from(json.blob, 'base64')

                    // parse manifest
                    const manifest = parse_manifest(Buffer.from(json.manifest, 'base64'))

                    // verify manifest signature and payload signature
                    const master_key = ed25519.keyFromPublic(master_public_key.slice(2), 'hex')
                    assert(master_key.verify(manifest.without_signing_fields, manifest.MasterSignature),
                        "Master signature in master manifest does not match vl key")
                    let signing_key = ed25519.keyFromPublic(manifest.SigningPubKey.slice(2), 'hex')
                    assert(signing_key.verify(blob.toString('hex'), json.signature),
                        "Payload signature in mantifest failed verification")
                    blob = JSON.parse(blob)

                    assert(blob.validators !== undefined, "validators missing from blob")

                    // parse manifests inside blob (actual validator list)
                    let unl = {}
                    for (idx in blob.validators)
                    {
                        assert(blob.validators[idx].manifest !== undefined,
                            "validators list in blob contains invalid entry (missing manifest)")
                        assert(blob.validators[idx].validation_public_key !== undefined,
                            "validators list in blob contains invalid entry (missing validation public key)")
                        let manifest =
                            parse_manifest(Buffer.from(blob.validators[idx].manifest, 'base64'))

                        // verify signature
                        signing_key = ed25519.keyFromPublic(blob.validators[idx].validation_public_key.slice(2), 'hex')

                        assert(signing_key.verify(manifest.without_signing_fields,
                                manifest.MasterSignature),
                            "Validation manifest " + idx + " signature verification failed")

                        blob.validators[idx].validation_public_key =
                            Buffer.from(blob.validators[idx].validation_public_key, 'hex')

                        blob.validators[idx].manifest = manifest
                        
                        let nodepub = codec.address.encodeNodePublic(Buffer.from(manifest.SigningPubKey, 'hex'))
                        unl[nodepub] = manifest.SigningPubKey
                    }
                    resolve({unl: {...unl}, vl: json})
                }
                catch (e)
                {
                    assert(false, e)
                }
            })
        }).on('error', e => {
            assert(false, e)
        })
    })
}

module.exports = {
    fetch_validated_unl: fetch_validated_unl
}

