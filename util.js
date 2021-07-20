
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

module.exports = { make_vl_bytes: make_vl_bytes }
