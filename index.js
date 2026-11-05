/**
 * Tiiny local video model bridge.
 *
 * Host half: talks to the Tiiny device's OpenAI-compatible Videos API
 * (POST /v1/videos + GET /v1/videos/{id} + GET /v1/videos/{id}/content),
 * stores rendered clips on disk, and serves a tiny control API the Client
 * panel calls.
 */
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))

/**
 * User data lives outside the package.
 *
 * An installed plugin sits in a read-only-ish package directory that pnpm may
 * replace on upgrade or reinstall, so settings and history written next to
 * this file would disappear on every update. `~/.tiiny-video` (overridable
 * with TIINY_VIDEO_HOME) survives upgrades, reindexes and profile rebuilds.
 */
const DATA_DIR = process.env.TIINY_VIDEO_HOME
  ? path.resolve(process.env.TIINY_VIDEO_HOME)
  : path.join(os.homedir(), '.tiiny-video')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const HISTORY_FILE = path.join(DATA_DIR, 'history.json')

/** Earlier local builds of this plugin kept their data inside the package. */
const LEGACY_SETTINGS_FILE = path.join(PLUGIN_DIR, 'settings.json')
const LEGACY_HISTORY_FILE = path.join(PLUGIN_DIR, 'history.json')

const SIZES = ['832x480', '480x832', '1344x768', '768x1344']

/**
 * Exported-shape spec.
 *
 * The Tiiny device does not compile video graphs on the fly: a fixed set of
 * (resolution x duration) shapes is exported ahead of time and anything else
 * is rejected with `no exported bucket fits a request needing [...]`.
 * The resolutions below are the ones the device reports (`this model was
 * exported for [...]`), and 5-7 s is the duration window that renders on this
 * device; 8 s and longer are rejected. Keep this table conservative: it is the
 * single source of truth for both the picker and the pre-flight check.
 */
const DEFAULT_SPEC = {
  '832x480': [5, 6, 7],
  '480x832': [5, 6, 7],
  '1344x768': [5, 6, 7],
  '768x1344': [5, 6, 7],
}

const BUCKET_ERROR = /no exported bucket fits a request needing \[audio=(\d+), cond_video=(\d+), target_video=(\d+)\]/i
const EXPORTED_ERROR = /this model was exported for \[([^\]]+)\]/i

const DEFAULTS = {
  baseUrl: process.env.TIINY_BASE_URL || 'http://openai.api.tiiny/v1',
  apiKey: process.env.TIINY_API_KEY || '',
  model: process.env.TIINY_MODEL || 'lightx2v/MiniMax-H3-Turbo',
  size: '832x480',
  seconds: 5,
  outputDir: path.join(os.homedir(), 'tiiny-videos'),
}

const jobs = new Map()

const FFMPEG = process.env.TIINY_FFMPEG || 'ffmpeg'
const FFPROBE = process.env.TIINY_FFPROBE || 'ffprobe'

/** Copy a pre-1.1 data file out of the package directory exactly once. */
let migrated = false
async function migrateLegacyData() {
  if (migrated) return
  migrated = true
  // A custom TIINY_VIDEO_HOME means the user picked the data location on
  // purpose, so dragging old in-package files into it would be surprising.
  if (process.env.TIINY_VIDEO_HOME) return
  for (const [target, legacy] of [
    [SETTINGS_FILE, LEGACY_SETTINGS_FILE],
    [HISTORY_FILE, LEGACY_HISTORY_FILE],
  ]) {
    try {
      await fs.access(target)
      continue
    } catch {}
    try {
      const contents = await fs.readFile(legacy, 'utf8')
      await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
      await fs.writeFile(target, contents, { mode: 0o600 })
    } catch {}
  }
}

/** Shape of a clip found on disk, read once per file version. */
const probeCache = new Map()

function probeShape(filePath) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(FFPROBE, ['-v', 'error', '-show_entries', 'stream=width,height', '-show_entries', 'format=duration', '-of', 'json', filePath], { stdio: ['ignore', 'pipe', 'ignore'] })
    } catch {
      resolve(null)
      return
    }
    let out = ''
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    child.stdout?.on('data', (chunk) => {
      out += chunk
    })
    child.on('error', () => done(null))
    child.on('exit', (code) => {
      if (code !== 0) return done(null)
      try {
        const parsed = JSON.parse(out)
        const stream = (parsed.streams || [])[0] || {}
        const duration = Number(parsed.format?.duration)
        const width = Number(stream.width) || 0
        const height = Number(stream.height) || 0
        done(width && height ? { size: `${width}x${height}`, seconds: Number.isFinite(duration) ? Math.round(duration) : undefined } : null)
      } catch {
        done(null)
      }
    })
    setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {}
      done(null)
    }, 6000)
  })
}

/**
 * The device returns a fragmented MP4 whose mvhd duration is 0 and that carries
 * no mehd/sidx index. Players then report a bogus length (roughly the first
 * fragment, about a second) and cannot seek. A stream-copy remux writes a
 * normal moov with a real duration, and +faststart puts it ahead of the media
 * so playback and seeking work while the file is still streaming.
 *
 * Best effort: if ffmpeg is missing or fails, the original bytes are kept.
 */
function remuxFaststart(filePath) {
  return new Promise((resolve) => {
    const target = `${filePath}.remux.mp4`
    let settled = false
    const finish = async (ok) => {
      if (settled) return
      settled = true
      if (ok) {
        try {
          await fs.rename(target, filePath)
          resolve(true)
          return
        } catch {}
      }
      await fs.rm(target, { force: true }).catch(() => {})
      resolve(false)
    }
    let child
    try {
      child = spawn(FFMPEG, ['-y', '-v', 'error', '-i', filePath, '-c', 'copy', '-movflags', '+faststart', target], { stdio: 'ignore' })
    } catch {
      resolve(false)
      return
    }
    child.on('error', () => void finish(false))
    child.on('exit', (code) => void finish(code === 0))
    setTimeout(() => {
      if (settled) return
      try {
        child.kill('SIGKILL')
      } catch {}
      void finish(false)
    }, 120000)
  })
}

/**
 * Finished jobs are also written to history.json.
 *
 * A page reload, a reindex, or a Host restart drops the in-memory Map, and the
 * rendered clip then looks lost even though it is already on disk. The history
 * file is the durable record the panel lists, so a finished video can always be
 * found again by name.
 */
async function readHistory() {
  await migrateLegacyData()
  try {
    const parsed = JSON.parse(await fs.readFile(HISTORY_FILE, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** Every rendered clip in the output folder, including ones this Host never ran. */
async function listRenderedFiles(settings) {
  const dir = settings.outputDir || DEFAULTS.outputDir
  let names = []
  try {
    names = await fs.readdir(dir)
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    if (!name.endsWith('.mp4') || name.startsWith('.')) continue
    try {
      const filePath = path.join(dir, name)
      const stat = await fs.stat(filePath)
      const cacheKey = `${filePath}:${stat.mtimeMs}:${stat.size}`
      let shape = probeCache.get(cacheKey)
      if (shape === undefined) {
        shape = await probeShape(filePath)
        probeCache.set(cacheKey, shape)
      }
      out.push({
        id: `file:${name}`,
        status: 'completed',
        phase: 'completed',
        progress: 100,
        file: name,
        bytes: stat.size,
        finishedAt: stat.mtimeMs,
        createdAt: stat.mtimeMs,
        prompt: '',
        size: shape?.size || '',
        seconds: shape?.seconds,
      })
    } catch {}
  }
  return out
}

async function recordHistory(job) {
  try {
    const entry = {
      id: job.id,
      status: job.status,
      phase: job.phase,
      prompt: job.prompt,
      size: job.size,
      seconds: job.seconds,
      file: job.file,
      bytes: job.bytes,
      error: job.error,
      tiinyId: job.tiinyId,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt || Date.now(),
    }
    const history = (await readHistory()).filter((item) => item && item.id !== entry.id)
    history.unshift(entry)
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history.slice(0, 50), null, 2), { mode: 0o600 })
  } catch {}
}

/** Sanitise the spec table: known resolutions only, ascending, de-duplicated durations. */
function resolveSpec(settings) {
  const stored = settings && typeof settings.spec === 'object' ? settings.spec : null
  const spec = {}
  for (const size of SIZES) {
    const raw = stored && Array.isArray(stored[size]) ? stored[size] : DEFAULT_SPEC[size]
    const values = [...new Set(raw.map(Number).filter((value) => Number.isFinite(value) && value > 0 && value <= 60))]
      .sort((a, b) => a - b)
    if (values.length) spec[size] = values
  }
  return Object.keys(spec).length ? spec : structuredClone(DEFAULT_SPEC)
}

function nearestValue(values, target) {
  return values.reduce((best, value) => (Math.abs(value - target) < Math.abs(best - target) ? value : best), values[0])
}

/** Snap a stored size/duration pair onto the spec so stale settings can never reach the device. */
function normalizeSelection(settings) {
  const spec = resolveSpec(settings)
  const size = spec[settings.size] ? settings.size : Object.keys(spec)[0]
  const seconds = nearestValue(spec[size], Number(settings.seconds))
  return { spec, size, seconds }
}

/** Turn the device's shape errors into something actionable in the panel. */
function humanizeDeviceError(message, { size, spec }) {
  const text = String(message || '')
  const bucket = BUCKET_ERROR.exec(text)
  if (bucket) {
    const allowed = (spec && spec[size]) || []
    const hint = allowed.length ? `${size} 目前只导出了 ${allowed.join(' / ')} 秒` : '当前组合没有导出'
    return `设备没有为这个形状导出计算图：需要 audio=${bucket[1]}、cond_video=${bucket[2]}、target_video=${bucket[3]} 个 token，没有任何 bucket 能装下。${hint}，请改选。`
  }
  const exported = EXPORTED_ERROR.exec(text)
  if (exported) {
    return `设备没有导出 ${size} 这个分辨率（已导出：${exported[1]}），请换一个分辨率。`
  }
  return text || 'generation failed'
}

async function readSettings() {
  await migrateLegacyData()
  let stored = {}
  try {
    stored = JSON.parse(await fs.readFile(SETTINGS_FILE, 'utf8'))
  } catch {}
  const merged = { ...DEFAULTS, ...stored }
  if (!merged.apiKey && process.env.TIINY_API_KEY) merged.apiKey = process.env.TIINY_API_KEY
  if (process.env.TIINY_OUTPUT_DIR) merged.outputDir = path.resolve(process.env.TIINY_OUTPUT_DIR)
  const { spec, size, seconds } = normalizeSelection(merged)
  return { ...merged, spec, size, seconds }
}

async function writeSettings(patch) {
  const current = await readSettings()
  const next = { ...current, ...patch }
  // Never persist the resolved spec unless it was explicitly overridden, so
  // DEFAULT_SPEC in this file stays authoritative.
  if (!Object.prototype.hasOwnProperty.call(patch, 'spec')) delete next.spec
  await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o700 })
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(next, null, 2), { mode: 0o600 })
  return next
}

function publicSettings(s) {
  return {
    baseUrl: s.baseUrl,
    model: s.model,
    size: s.size,
    seconds: s.seconds,
    outputDir: s.outputDir,
    hasApiKey: Boolean(s.apiKey),
    spec: s.spec,
    sizes: Object.keys(s.spec),
  }
}

function json(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

async function readJsonBody(req, limit = 24 * 1024 * 1024) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(String(dataUrl || '').trim())
  if (!match) return undefined
  const mime = match[1].toLowerCase()
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png'
  return { mime, ext, bytes: Buffer.from(match[2], 'base64') }
}

class TiinyApi {
  constructor(settings) {
    this.settings = settings
    this.root = settings.baseUrl.replace(/\/+$/, '')
  }

  headers(extra = {}) {
    return { authorization: `Bearer ${this.settings.apiKey}`, ...extra }
  }

  async request(pathname, init = {}) {
    const response = await fetch(`${this.root}${pathname}`, {
      ...init,
      headers: this.headers(init.headers || {}),
      signal: AbortSignal.timeout(init.timeoutMs || 120000),
    })
    return response
  }

  async create({ prompt, image, size, seconds, model }) {
    const form = new FormData()
    form.set('model', model)
    form.set('prompt', prompt)
    form.set('size', size)
    form.set('seconds', String(seconds))
    if (image) {
      form.set('input_reference', new Blob([image.bytes], { type: image.mime }), `first-frame.${image.ext}`)
    }
    const response = await this.request('/videos', { method: 'POST', body: form })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.error) {
      const message = payload?.error?.message || payload?.error || `HTTP ${response.status}`
      throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
    }
    return payload
  }

  async retrieve(id) {
    const response = await this.request(`/videos/${encodeURIComponent(id)}`, { timeoutMs: 30000 })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.error) {
      const message = payload?.error?.message || payload?.error || `HTTP ${response.status}`
      throw new Error(typeof message === 'string' ? message : JSON.stringify(message))
    }
    return payload
  }

  async cancel(id) {
    const response = await this.request(`/videos/${encodeURIComponent(id)}`, { method: 'DELETE', timeoutMs: 30000 })
    return response.ok
  }

  async content(id) {
    const response = await this.request(`/videos/${encodeURIComponent(id)}/content`, { timeoutMs: 300000 })
    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(text || `content download failed: HTTP ${response.status}`)
    }
    return Buffer.from(await response.arrayBuffer())
  }
}

function stamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

async function runJob(jobId, request) {
  const job = jobs.get(jobId)
  const shape = { size: job.size, seconds: job.seconds, spec: undefined }
  try {
    const settings = await readSettings()
    shape.spec = settings.spec
    const api = new TiinyApi(settings)
    const model = request.model || settings.model
    job.phase = 'submitting'
    const created = await api.create({
      prompt: request.prompt,
      image: dataUrlToBlob(request.imageDataUrl),
      size: job.size,
      seconds: job.seconds,
      model,
    })
    job.tiinyId = created.id
    job.phase = created.status || 'queued'
    job.progress = Number(created.progress) || 0

    const deadline = Date.now() + 45 * 60 * 1000
    let snapshot = created
    while (Date.now() < deadline) {
      if (job.cancelled) throw new Error('cancelled')
      if (snapshot.status === 'completed') break
      if (snapshot.status === 'failed') {
        throw new Error(snapshot.error?.message || 'generation failed')
      }
      await new Promise((resolve) => setTimeout(resolve, 3000))
      snapshot = await api.retrieve(created.id)
      job.phase = snapshot.status
      job.progress = Number(snapshot.progress) || 0
    }
    if (snapshot.status !== 'completed') throw new Error('generation timed out')

    job.phase = 'downloading'
    const bytes = await api.content(created.id)
    const dir = settings.outputDir || DEFAULTS.outputDir
    await fs.mkdir(dir, { recursive: true })
    const fileName = `tiiny-video-${stamp()}-${jobId.slice(0, 6)}.mp4`
    const filePath = path.join(dir, fileName)
    await fs.writeFile(filePath, bytes)
    await remuxFaststart(filePath)

    job.status = 'completed'
    job.phase = 'completed'
    job.progress = 100
    job.file = fileName
    job.filePath = filePath
    job.bytes = (await fs.stat(filePath)).size
    job.finishedAt = Date.now()
    await recordHistory(job)
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error)
    job.status = 'failed'
    job.phase = 'failed'
    job.error = raw === 'cancelled' ? raw : humanizeDeviceError(raw, shape)
    job.finishedAt = Date.now()
    await recordHistory(job)
  }
}

function jobView(job) {
  return {
    id: job.id,
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    error: job.error,
    file: job.file,
    url: job.file ? `/tiiny-video/file/${encodeURIComponent(job.file)}` : undefined,
    bytes: job.bytes,
    prompt: job.prompt,
    size: job.size,
    seconds: job.seconds,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  }
}

export const inject = ['webServer']

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register(route))
}

const route = {
  kind: 'prefix',
  path: '/tiiny-video',
  async handler(req, res) {
    const url = new URL(req.url || '/', 'http://localhost')
    const pathname = url.pathname.replace(/^\/tiiny-video/, '') || '/'
    try {
      if (req.method === 'GET' && (pathname === '/' || pathname === '/settings')) {
        return json(res, 200, publicSettings(await readSettings()))
      }
      if (req.method === 'POST' && pathname === '/settings') {
        const body = await readJsonBody(req, 64 * 1024)
        const patch = {}
        for (const key of ['baseUrl', 'model', 'size', 'outputDir']) {
          if (typeof body[key] === 'string' && body[key].trim()) patch[key] = body[key].trim()
        }
        if (typeof body.seconds === 'number' && Number.isFinite(body.seconds)) patch.seconds = body.seconds
        if (typeof body.apiKey === 'string' && body.apiKey.trim()) patch.apiKey = body.apiKey.trim()
        await writeSettings(patch)
        return json(res, 200, publicSettings(await readSettings()))
      }
      if (req.method === 'POST' && pathname === '/generate') {
        const body = await readJsonBody(req)
        const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
        if (!prompt) return json(res, 400, { error: 'prompt is required' })
        const settings = await readSettings()
        if (!settings.apiKey) return json(res, 400, { error: 'Tiiny API key is not configured' })

        // Pre-flight: never hand the device a shape it has not exported.
        const spec = settings.spec
        const size = typeof body.size === 'string' && body.size.trim() ? body.size.trim() : settings.size
        const allowed = spec[size]
        if (!allowed) {
          return json(res, 400, {
            error: `设备没有导出 ${size} 这个分辨率，可用分辨率：${Object.keys(spec).join(' / ')}`,
          })
        }
        const seconds = Number(body.seconds ?? settings.seconds)
        if (!allowed.includes(seconds)) {
          return json(res, 400, {
            error: `${size} 只导出了 ${allowed.join(' / ')} 秒，${body.seconds ?? seconds} 秒会被设备拒绝（no exported bucket fits）。请改选时长。`,
          })
        }

        const id = randomUUID()
        const job = {
          id,
          status: 'running',
          phase: 'queued',
          progress: 0,
          prompt,
          size,
          seconds,
          createdAt: Date.now(),
        }
        jobs.set(id, job)
        void runJob(id, { ...body, size, seconds })
        return json(res, 200, jobView(job))
      }
      if (req.method === 'POST' && pathname === '/cancel') {
        const body = await readJsonBody(req, 64 * 1024)
        const job = jobs.get(String(body.id || ''))
        if (!job) return json(res, 404, { error: 'unknown job' })
        job.cancelled = true
        if (job.tiinyId) {
          const settings = await readSettings()
          await new TiinyApi(settings).cancel(job.tiinyId).catch(() => {})
        }
        job.status = 'failed'
        job.phase = 'failed'
        job.error = 'cancelled'
        job.finishedAt = Date.now()
        return json(res, 200, jobView(job))
      }
      if (req.method === 'GET' && pathname === '/job') {
        const job = jobs.get(url.searchParams.get('id') || '')
        if (!job) return json(res, 404, { error: 'unknown job' })
        return json(res, 200, jobView(job))
      }
      if (req.method === 'GET' && pathname === '/jobs') {
        const live = [...jobs.values()].map(jobView)
        const seen = new Set(live.map((item) => item.id))
        const dir = (await readSettings()).outputDir || DEFAULTS.outputDir
        // Drop history rows whose clip is gone, so a deleted video stops showing up.
        const past = []
        for (const item of (await readHistory()).filter((entry) => !seen.has(entry.id))) {
          if (item.file) {
            try {
              await fs.stat(path.join(dir, item.file))
            } catch {
              continue
            }
          }
          past.push(jobView(item))
        }
        const knownFiles = new Set([...past, ...live].map((item) => item.file).filter(Boolean))
        const files = (await listRenderedFiles({ outputDir: dir }))
          .filter((item) => !knownFiles.has(item.file))
          .map(jobView)
        const merged = [...live, ...past, ...files].sort(
          (a, b) => (b.finishedAt || 0) - (a.finishedAt || 0) || (b.createdAt || 0) - (a.createdAt || 0),
        )
        return json(res, 200, { jobs: merged.slice(0, 40) })
      }
      if (req.method === 'GET' && pathname.startsWith('/file/')) {
        const name = decodeURIComponent(pathname.slice('/file/'.length))
        if (name.includes('/') || name.includes('..')) return json(res, 400, { error: 'bad name' })
        const settings = await readSettings()
        const filePath = path.join(settings.outputDir || DEFAULTS.outputDir, name)
        const stat = await fs.stat(filePath)
        const total = stat.size
        const headers = {
          'content-type': 'video/mp4',
          'accept-ranges': 'bytes',
          'cache-control': 'private, no-cache',
        }
        const range = typeof req.headers.range === 'string' ? req.headers.range.trim() : ''
        const parsed = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null
        if (parsed) {
          const total_ = total
          let start = parsed[1] ? Number(parsed[1]) : 0
          let end = parsed[2] ? Number(parsed[2]) : total_ - 1
          if (!parsed[1] && parsed[2]) {
            start = Math.max(0, total_ - Number(parsed[2]))
            end = total_ - 1
          }
          end = Math.min(end, total_ - 1)
          if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total_) {
            res.writeHead(416, { 'content-range': `bytes */${total_}` })
            res.end()
            return
          }
          res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${total_}`, 'content-length': end - start + 1 })
          if (req.method === 'HEAD') {
            res.end()
            return
          }
          createReadStream(filePath, { start, end }).pipe(res)
          return
        }
        res.writeHead(200, { ...headers, 'content-length': total })
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        createReadStream(filePath).pipe(res)
        return
      }
      return json(res, 404, { error: 'not found' })
    } catch (error) {
      return json(res, 500, { error: error instanceof Error ? error.message : String(error) })
    }
  },
}
