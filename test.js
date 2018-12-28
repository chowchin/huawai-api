const test = require('tape')
const HuaweiApi = require('.')

let client

test('create client and send sms', async t => {
  client = new HuaweiApi('192.168.8.1')
  await client.login('admin', 'password')
  await client.sendSms('91234567', 'Hello World')
  t.end()
})

test('device info', async t => {
  client = new HuaweiApi('192.168.8.1')
  let deviceInfo = await client.deviceInfo()
  console.log('deviceInfo', deviceInfo)
  t.end()
})