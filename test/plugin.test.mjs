/**
 * Smoke tests for the Host half.
 *
 * The plugin needs no dependencies, so these run with plain `node --test`.
 * Every test points TIINY_VIDEO_HOME at a temp directory: the suite must never
 * touch a real ~/.tiiny-video (it would hold a real API key).
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let dataDir
let route

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tiiny-video-test-'))
  // Read by the module at import time, so it has to be set before the import.
  process.env.TIINY_VIDEO_HOME = dataDir
  // Keep /jobs away from whatever the developer really rendered.
  process.env.TIINY_OUTPUT_DIR = await fs.mkdtemp(path.join(os.tmpdir(), 'tiiny-video-out-'))
  delete process.env.TIINY_API_KEY
  delete process.env.TIINY_BASE_URL

  const { apply } = await import('../index.js')
  const registered = []
  apply({
    effect: (fn) => fn(),
    webServer: { register: (value) => registered.push(value) },
  })
  assert.equal(registered.length, 1, 'plugin should register exactly one route')
  route = registered[0]
})

after(async () => {
  await fs.rm(dataDir, { recursive: true, force: true })
})

function request({ method = 'GET', pathname = '/', body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = {
    method,
    url: `/tiiny-video${pathname}`,
    headers: {},
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
  const res = {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(code, headers = {}) {
      this.statusCode = code
      Object.assign(this.headers, headers)
    },
    end(chunk) {
      if (chunk) this.body += chunk.toString()
    },
  }
  return { req, res }
}

async function call(options) {
  const { req, res } = request(options)
  await route.handler(req, res)
  return { status: res.statusCode, json: res.body ? JSON.parse(res.body) : null }
}

test('GET /settings returns defaults without the API key', async () => {
  const { status, json } = await call({ pathname: '/settings' })
  assert.equal(status, 200)
  assert.equal(json.hasApiKey, false)
  assert.equal(json.apiKey, undefined)
  assert.equal(json.size, '832x480')
  assert.deepEqual(json.sizes, ['832x480', '480x832', '1344x768', '768x1344'])
})

test('POST /settings persists the key but never echoes it', async () => {
  const { status, json } = await call({
    method: 'POST',
    pathname: '/settings',
    body: { apiKey: 'test-key', baseUrl: 'http://device.test:8000/v1', model: 'lightx2v/MiniMax-H3-Turbo' },
  })
  assert.equal(status, 200)
  assert.equal(json.hasApiKey, true)
  assert.equal(json.apiKey, undefined)
  assert.equal(json.baseUrl, 'http://device.test:8000/v1')

  const onDisk = JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8'))
  assert.equal(onDisk.apiKey, 'test-key')

  const stat = await fs.stat(path.join(dataDir, 'settings.json'))
  assert.equal(stat.mode & 0o077, 0, 'settings file must not be world readable')

  const reread = await call({ pathname: '/settings' })
  assert.equal(reread.json.hasApiKey, true)
  assert.equal(reread.json.apiKey, undefined)
})

test('POST /generate rejects an empty prompt', async () => {
  const { status, json } = await call({ method: 'POST', pathname: '/generate', body: {} })
  assert.equal(status, 400)
  assert.match(json.error, /prompt/i)
})

test('POST /generate rejects a resolution the device never exported', async () => {
  const { status, json } = await call({
    method: 'POST',
    pathname: '/generate',
    body: { prompt: 'a robot waters a seedling', size: '1920x1080', seconds: 5 },
  })
  assert.equal(status, 400)
  assert.match(json.error, /1920x1080/)
})

test('POST /generate rejects a duration outside the exported window', async () => {
  const { status, json } = await call({
    method: 'POST',
    pathname: '/generate',
    body: { prompt: 'a robot waters a seedling', size: '832x480', seconds: 30 },
  })
  assert.equal(status, 400)
  assert.match(json.error, /832x480/)
  assert.match(json.error, /30/)
})

test('GET /jobs starts empty', async () => {
  const { status, json } = await call({ pathname: '/jobs' })
  assert.equal(status, 200)
  assert.deepEqual(json.jobs, [])
})

test('unknown routes are a 404, not a crash', async () => {
  const { status } = await call({ pathname: '/nope' })
  assert.equal(status, 404)
})
