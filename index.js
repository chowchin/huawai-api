const {
  promisify
} = require('util')
const xml2js = require('xml2js')
const parseXml = promisify(require('xml2js').parseString)
const request = (require('request-promise')).defaults({
  followAllRedirects: false,
  jar: true
})
const debug = require('debug')('huawei-api')
const builder = new xml2js.Builder()
const crypto = require("crypto")
const moment = require('moment')

function objectMap(object, mapFn) {
  return Object.keys(object).reduce(function (result, key) {
    result[key] = mapFn(object[key])
    return result
  }, {})
}

module.exports =
  class HuaweiApi {
    constructor(host = '192.168.8.1') {
      this.host = host

      this._request = request.defaults({
        followAllRedirects: false,
        jar: true
      })
    }

    async request(path) {
      let responseXml = await this._request('http://' + this.host + path)
      let {
        response
      } = await parseXml(responseXml)
      return objectMap(response, val => val[0])
    }

    async apiRequest(path, requestData) {

      let requestXml = builder.buildObject(requestData)
      debug('apiPost, request', path, requestXml)

      let responseXml = await this._request({
        url: 'http://' + this.host + path,
        body: requestXml,
        headers: {
          'Content-Type': 'text/xml',
          '__RequestVerificationToken': await this.getToken()
        }
      })
      debug('apiPost, response', responseXml)
      let {
        response
      } = await parseXml(responseXml)
      return objectMap(response, val => val[0])
    }

    async apiPost(path, requestData) {
      let requestXml = builder.buildObject(requestData)
      debug('apiPost, request', path, requestXml)

      let responseXml = await this._request.post({
        url: 'http://' + this.host + path,
        body: requestXml,
        headers: {
          'Content-Type': 'text/xml',
          '__RequestVerificationToken': await this.getToken()
        }
      })
      debug('apiPost, response', responseXml)
      let {
        response
      } = await parseXml(responseXml)
      return objectMap(response, val => val[0])
    }

    async getToken() {
      let tokenData = await this.request('/api/webserver/SesTokInfo')
      debug('getToken, tokenData', tokenData)
      return tokenData.TokInfo
    }

    getClientProof(clientnonce, servernonce, password, salt, iterations) {
      debug('getClientProof', clientnonce, servernonce, salt, iterations)
      let saltedPass = crypto.pbkdf2Sync(password, new Buffer(salt, 'hex'), iterations, 32, 'sha256')
      debug('saltedPass', saltedPass)

      let clientKey = crypto.createHmac('sha256', 'Client Key').update(saltedPass).digest()
      debug('clientKey', clientKey)

      let storedKey = crypto.createHash('sha256').update(clientKey).digest()
      debug('storedKey', storedKey)

      let signature = crypto.createHmac('sha256', clientnonce + ',' + servernonce + ',' + servernonce).update(storedKey).digest()
      debug('signature', signature)

      let clientProof = Buffer.alloc(clientKey.length)
      let i = 0
      for (i = 0; i < clientKey.length; i++) {
        debug('building', i, clientKey[i], signature[i], clientKey[i] ^ signature[i])
        clientProof[i] = clientKey[i] ^ signature[i]
      }
      debug('clientProof', clientProof)

      return clientProof.toString('hex')
    }

    async login(username, password) {
      let clientnonce = this.getUuid() + this.getUuid()

      let requestData = {}
      requestData.request = {}
      requestData.request.username = username
      requestData.request.firstnonce = clientnonce
      requestData.request.mode = 1

      let loginData = await this.apiPost('/api/user/challenge_login', requestData)
      debug('login, loginData', loginData)

      let proof = this.getClientProof(clientnonce, loginData.servernonce, password, loginData.salt, loginData.iterations * 1)
      requestData = {}
      requestData.request = {}
      requestData.request.clientproof = proof
      requestData.request.finalnonce = loginData.servernonce
      debug('authentication_login, requestData', requestData)
      let loginResult = await this.apiPost('/api/user/authentication_login', requestData)
      debug('login, loginResult', loginResult)

      let stateLogiResult = await this.apiRequest('/api/user/state-login', {})
      debug('login, stateLogiResult', stateLogiResult)
    }

    async sendSms(number, message) {
      let requestData = {}
      requestData.request = {}
      requestData.request.Phones = {
        'Phone': number
      }
      requestData.request.Sca = ''
      requestData.request.Content = message
      requestData.request.Length = message.length
      requestData.request.Reserved = 1
      requestData.request.Date = moment().format('YYYY-MM-DD HH:mm:ss')

      debug('sendSms, requestData', requestData)
      let sendSmsResponse = await this.apiPost('/api/sms/send-sms', requestData)
      debug('sendSms, sendSmsResponse', sendSmsResponse)
    }

    getUuid() {
      var rnd = crypto.randomBytes(16)
      rnd[6] = (rnd[6] & 0x0f) | 0x40
      rnd[8] = (rnd[8] & 0x3f) | 0x80
      rnd = rnd.toString("hex").match(/(.{8})(.{4})(.{4})(.{4})(.{12})/)
      rnd.shift()
      return rnd.join("")
    }
  }