const Web3 = require('web3')
const Utils = require('web3-utils')
const fs =require('fs')
const lineReader = require('line-reader');
const axios = require('axios').default

const url = 'https://http-testnet.hecochain.com'
const web3 = new Web3(url)


const privateKey = '0xffdee7f3fa4d2414b7bc2897dcc51817fd44f735e5c6b30346d75ce5d8f090aa'

async function broadcast(data) {
    let resp = await  axios.post(url, {
        id: 1,
        jsonrpc: "2.0",
        method: "eth_sendRawTransaction",
        params: [
            data
        ]
    }, {
        timeout: 2000
    })

    // console.log(resp.data)

    return resp
}

async function sign (from, to, nonce, value, data, extraConfig) {

    let acc = web3.eth.accounts.privateKeyToAccount(privateKey)
    if(acc.address !== from) {
        throw new Error(`address:${from} is not Corresponding to the private key`)
    }

    let chainId = 256 // await web3.eth.getChainId()

    let unsigned = {
        nonce,
        chainId,
        from: acc.address,
        to,
        value: web3.utils.numberToHex(web3.utils.toWei(value, 'wei')),
        data,
        ...extraConfig
    }

    let signed = await acc.signTransaction(unsigned)
    signed.raw = signed.rawTransaction

    return signed
}

const addrFile = 'address.txt'
const signFile = 'signed.txt'
async function main() {
    let args = process.argv.slice(2)

    if(args.length < 1) {
        throw new Error("need args 'sign' or 'brocadcast'")
    }


    let from = '0xDd698C89c3fFe1D258c181526E611e825f78B410'
    if(args[0] === 'sign') {
        let logger = fs.createWriteStream(signFile, {
        flags: 'a' // 'a' means appending (old data will be preserved)
        })

        let nonce = await web3.eth.getTransactionCount(from)

        lineReader.eachLine(addrFile, async function(line) {
            if(!line) {
                return
            }

            let signed = await sign(from, line.trim(), nonce, '1', null, {gas: 21000, gasPrice: Utils.numberToHex(Utils.toWei('1', 'gwei'))})
            //save to file
            logger.write(`${nonce}, ${signed.rawTransaction}\n`)
            nonce++
        })

        return 
    }

    if(args[0] === 'broadcast') {
        let cache =new Map()
        let maxNonce = 0
        lineReader.eachLine(signFile, async function(line, last) {
            let data = line.split(',')
            let nonce = parseInt(data[0])
            cache.set(nonce, data[1])

            if(nonce > maxNonce) {
                maxNonce = nonce
            }

            if(last) {
                console.log(`max nonce:${maxNonce}`)
                console.log(`broadcast started:${new Date()}`)

                while(true) {
                    try{
                        let nonce = await web3.eth.getTransactionCount(from)
                        if(nonce >= maxNonce) {
                            break
                        }

                        let requests = []
                        for(let i =nonce; i< nonce+200; i++) {
                            if(i > maxNonce) {
                                break
                            }

                            if(!cache.get(i)) {
                                console.log(`nonce ${i} not found tx`)
                                break
                            }
                            requests.push(broadcast(cache.get(i).trim()))
                        }

                        await Promise.all(requests)

                        await sleep(1000)
                    }catch(err) {
                        console.error(err)
                    }
                }
                console.log(`broadcast finished:${new Date()}`)
            }
        })
    }
}

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main().then(console.log).catch(console.error)