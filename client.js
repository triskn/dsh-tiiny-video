window.__ModuleLoader__.load({
  id: 'dsh-tiiny-video',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    const T = {
      title: 'Tiiny Video',
      subtitle: 'First frame + prompt → local MiniMax video',
      prompt: 'Prompt',
      promptPlaceholder: 'Describe the shot you want…',
      firstFrame: 'First frame (optional)',
      drop: 'Drop an image here or click to choose',
      replace: 'Replace',
      clear: 'Remove',
      size: 'Resolution',
      seconds: 'Seconds',
      secondsHint: 'Only the lengths exported on this device can be picked',
      badShape: 'This resolution/duration is not exported on the device — pick another combination',
      generate: 'Generate video',
      generating: 'Generating…',
      cancel: 'Cancel',
      done: 'Saved',
      failed: 'Failed',
      settings: 'Settings',
      baseUrl: 'API base URL',
      model: 'Model',
      apiKey: 'API key',
      apiKeySet: 'Key configured — leave blank to keep it',
      outputDir: 'Output folder',
      save: 'Save',
      saved: 'Saved',
      needPrompt: 'Enter a prompt first',
      recent: 'Recent videos',
      preview: 'Preview',
      needKey: 'Add your Tiiny API key in Settings',
    }

    const S = {
      card: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 12,
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
        overflow: 'hidden',
      },
      header: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        cursor: 'pointer',
        userSelect: 'none',
      },
      dot: { width: 8, height: 8, borderRadius: 4, background: 'var(--dsw-alias-brand-primary)', flex: '0 0 auto' },
      title: { fontWeight: 600 },
      subtitle: { color: 'var(--dsw-alias-label-secondary)', flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      body: { padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 10 },
      label: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 },
      textarea: {
        width: '100%',
        boxSizing: 'border-box',
        resize: 'vertical',
        minHeight: 56,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        outline: 'none',
      },
      row: { display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' },
      input: {
        padding: '6px 8px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
      },
      drop: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 72,
        borderRadius: 8,
        border: '1px dashed var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-base)',
        color: 'var(--dsw-alias-label-secondary)',
        cursor: 'pointer',
        padding: 8,
      },
      thumb: { maxHeight: 96, maxWidth: 160, borderRadius: 6, display: 'block' },
      button: {
        padding: '7px 14px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        cursor: 'pointer',
      },
      primary: {
        padding: '7px 16px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-brand-primary)',
        background: 'var(--dsw-alias-brand-primary)',
        color: '#fff',
        font: 'inherit',
        fontWeight: 600,
        cursor: 'pointer',
      },
      link: { color: 'var(--dsw-alias-brand-primary)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, font: 'inherit' },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 12 },
      field: { display: 'flex', flexDirection: 'column', gap: 6 },
      actions: { display: 'flex', alignItems: 'center', gap: 8 },
      ghost: {
        background: 'transparent',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 8,
        color: 'var(--dsw-alias-label-primary)',
        padding: '8px 12px',
        font: 'inherit',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      },
      previewName: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '55%',
        textAlign: 'right',
      },
      overlay: {
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      },
      modal: {
        width: '100%',
        maxWidth: 860,
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: 12,
        borderRadius: 12,
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-1)',
        boxShadow: '0 18px 48px rgba(0, 0, 0, 0.32)',
        boxSizing: 'border-box',
      },
      modalVideo: {
        width: '100%',
        maxHeight: '72vh',
        borderRadius: 8,
        background: '#000',
        display: 'block',
        objectFit: 'contain',
      },
      iconButton: {
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-secondary)',
        borderRadius: 6,
        width: 22,
        height: 22,
        lineHeight: '18px',
        fontSize: 14,
        padding: 0,
        cursor: 'pointer',
        flex: '0 0 auto',
      },
      recentPanel: {
        border: '1px solid var(--dsw-alias-border-l1)',
        borderRadius: 10,
        background: 'var(--dsw-alias-bg-layer-1)',
        overflow: 'hidden',
      },
      recentHead: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
      },
      recentTitle: { fontSize: 12, fontWeight: 600, letterSpacing: 0.2, flex: 1 },
      recentRowDivider: { borderTop: '1px solid var(--dsw-alias-border-l1)' },
      recentRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '8px 10px',
        border: 'none',
        borderRadius: 0,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      },
      recentRowActive: { background: 'var(--dsw-alias-bg-layer-2)' },
      recentTime: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', flex: '0 0 auto', width: 92 },
      recentPrompt: { flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
      recentMeta: { fontSize: 11, color: 'var(--dsw-alias-label-secondary)', flex: '0 0 auto' },
      barTrack: { height: 6, borderRadius: 3, background: 'var(--dsw-alias-bg-layer-2)', overflow: 'hidden' },
      barFill: { height: '100%', background: 'var(--dsw-alias-brand-primary)', transition: 'width .4s ease' },
      meta: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      video: { width: '100%', maxHeight: '58vh', borderRadius: 8, background: '#000', display: 'block', objectFit: 'contain' },
      page: {
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '28px 32px 48px',
        maxWidth: 820,
        margin: '0 auto',
        width: '100%',
        boxSizing: 'border-box',
        color: 'var(--dsw-alias-label-primary)',
        fontSize: 13,
      },
      pageHeader: { display: 'flex', flexDirection: 'column', gap: 4 },
      pageTitle: { fontSize: 20, fontWeight: 600 },
      pageSub: { fontSize: 13, color: 'var(--dsw-alias-label-secondary)' },
    }

    // Mirror of the host spec, only used until /settings answers.
    const FALLBACK_SPEC = {
      '832x480': [5, 6, 7],
      '480x832': [5, 6, 7],
      '1344x768': [5, 6, 7],
      '768x1344': [5, 6, 7],
    }

    const PHASE = {
      queued: 'Queued',
      submitting: 'Submitting',
      in_progress: 'Rendering',
      downloading: 'Downloading',
      completed: 'Done',
      failed: 'Failed',
    }

    function readFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = () => reject(reader.error || new Error('read failed'))
        reader.readAsDataURL(file)
      })
    }

    function nearestSeconds(values, target) {
      if (!values.length) return target
      return values.reduce((best, value) => (Math.abs(value - target) < Math.abs(best - target) ? value : best), values[0])
    }

    /** Left-rail icon: the sidebar owns the button, this renders the glyph. */
    function PanelIcon({ size = 20, active = false }) {
      const edge = Math.max(16, Number(size) || 20)
      return h(
        'svg',
        { width: edge, height: edge, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        h('rect', {
          x: 2.5,
          y: 4.5,
          width: 19,
          height: 15,
          rx: 3.5,
          stroke: 'currentColor',
          strokeWidth: active ? 2.2 : 1.7,
          opacity: active ? 1 : 0.85,
        }),
        h('path', { d: 'M10 9.4 L15.2 12 L10 14.6 Z', fill: 'currentColor' }),
      )
    }

    function Panel(ctx, page) {
      return function TiinyVideoPanel() {
        const text = T

        const [expanded, setExpanded] = useState(false)
        const [settingsOpen, setSettingsOpen] = useState(false)
        const [prompt, setPrompt] = useState('')
        const [image, setImage] = useState(null)
        const [settings, setSettings] = useState({ size: '832x480', seconds: 5, hasApiKey: false, model: '', baseUrl: '', outputDir: '', spec: FALLBACK_SPEC, sizes: Object.keys(FALLBACK_SPEC) })
        const [draft, setDraft] = useState({})
        const [job, setJob] = useState(null)
        const [busy, setBusy] = useState(false)
        const [error, setError] = useState('')
        const [history, setHistory] = useState([])
        const [now, setNow] = useState(() => Date.now())
        const fileInput = useRef(null)
        const poll = useRef(null)
        const dragOver = useRef(false)

        useEffect(() => {
          let alive = true
          fetch('/tiiny-video/settings')
            .then((r) => r.json())
            .then((value) => {
              if (!alive || !value) return
              setSettings(value)
              setDraft({ baseUrl: value.baseUrl, model: value.model, seconds: value.seconds, outputDir: value.outputDir, apiKey: '' })
            })
            .catch(() => {})
          return () => {
            alive = false
            if (poll.current) clearInterval(poll.current)
          }
        }, [])

        useEffect(() => {
          const timer = setInterval(() => setNow(Date.now()), 1000)
          return () => clearInterval(timer)
        }, [])

        const stopPolling = useCallback(() => {
          if (poll.current) {
            clearInterval(poll.current)
            poll.current = null
          }
        }, [])

        const watch = useCallback(
          (id) => {
            stopPolling()
            poll.current = setInterval(async () => {
              try {
                const response = await fetch(`/tiiny-video/job?id=${encodeURIComponent(id)}`)
                const value = await response.json()
                setJob(value)
                if (value.status === 'completed' || value.status === 'failed') {
                  stopPolling()
                  setBusy(false)
                  if (value.status === 'failed') setError(value.error || 'generation failed')
                  void refreshHistory()
                }
              } catch (cause) {
                stopPolling()
                setBusy(false)
                setError(String(cause?.message || cause))
              }
            }, 2500)
          },
          [stopPolling],
        )

        const refreshHistory = useCallback(async () => {
          try {
            const response = await fetch('/tiiny-video/jobs')
            const value = await response.json()
            const items = Array.isArray(value?.jobs) ? value.jobs : []
            setHistory(items)
            return items.find((item) => item.status === 'running') || null
          } catch {
            return null
          }
        }, [])

        useEffect(() => {
          let alive = true
          void refreshHistory().then((running) => {
            if (!alive || !running) return
            setJob(running)
            setBusy(true)
            watch(running.id)
          })
          return () => {
            alive = false
          }
        }, [refreshHistory, watch])

        const generate = useCallback(async () => {
          if (!prompt.trim()) {
            setError(text.needPrompt)
            return
          }
          const exported = (settings.spec || {})[settings.size] || []
          if (!exported.includes(settings.seconds)) {
            setError(text.badShape)
            return
          }
          setError('')
          setBusy(true)
          setJob(null)
          try {
            const response = await fetch('/tiiny-video/generate', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                prompt: prompt.trim(),
                imageDataUrl: image?.dataUrl,
                size: settings.size,
                seconds: settings.seconds,
              }),
            })
            const value = await response.json()
            if (!response.ok || value.error) throw new Error(value.error || `HTTP ${response.status}`)
            setJob(value)
            watch(value.id)
            void refreshHistory()
          } catch (cause) {
            setBusy(false)
            setError(String(cause?.message || cause))
          }
        }, [prompt, image, settings.size, settings.seconds, settings.spec, text.needPrompt, text.badShape, watch, refreshHistory])

        const cancelJob = useCallback(async () => {
          if (!job?.id) return
          try {
            await fetch('/tiiny-video/cancel', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ id: job.id }),
            })
          } catch {}
          stopPolling()
          setBusy(false)
          setJob(null)
        }, [job, stopPolling])

        const saveSettings = useCallback(async () => {
          try {
            const response = await fetch('/tiiny-video/settings', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                baseUrl: draft.baseUrl,
                model: draft.model,
                outputDir: draft.outputDir,
                apiKey: draft.apiKey,
              }),
            })
            const value = await response.json()
            if (!response.ok || value.error) throw new Error(value.error || `HTTP ${response.status}`)
            setSettings(value)
            setDraft((current) => ({ ...current, apiKey: '' }))
            setError('')
            setSettingsOpen(false)
          } catch (cause) {
            setError(String(cause?.message || cause))
          }
        }, [draft])

        const pick = useCallback(async (file) => {
          if (!file || !String(file.type).startsWith('image/')) return
          const dataUrl = await readFileAsDataUrl(file)
          setImage({ dataUrl, name: file.name })
        }, [])

        const phaseLabel = job ? (PHASE[job.phase] || job.phase) : ''

        /** Wall-clock time the job has been alive: counts up while it renders. */
        const elapsedOf = (item) => {
          const start = Number(item && item.createdAt)
          if (!item || !start) return ''
          const running = item.status === 'running'
          const end = running ? now : Number(item.finishedAt || now)
          const total = Math.max(0, Math.round((end - start) / 1000))
          const hours = Math.floor(total / 3600)
          const minutes = Math.floor((total % 3600) / 60)
          const seconds = total % 60
          if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`
          return `${minutes}m ${String(seconds).padStart(2, '0')}s`
        }
        const progress = Math.max(0, Math.min(100, Number(job?.progress) || 0))

        const spec = settings.spec || {}
        const sizeOptions = Object.keys(spec)
        const durations = spec[settings.size] || []
        const durationsHint = durations.length ? `${text.secondsHint}: ${durations.map((value) => `${value}s`).join(' / ')}` : text.secondsHint
        const pickSize = (nextSize) => {
          const nextDurations = spec[nextSize] || []
          const nextSeconds = nextDurations.includes(settings.seconds) ? settings.seconds : nearestSeconds(nextDurations, settings.seconds)
          setSettings({ ...settings, size: nextSize, seconds: nextSeconds })
          setError('')
        }

        const jobElapsed = job ? elapsedOf(job) : ''
        const statusText = job && busy ? `${phaseLabel} ${progress}%${jobElapsed ? ` · ${jobElapsed}` : ''}` : text.subtitle

        const header = page
          ? h(
              'div',
              { style: S.pageHeader },
              h('div', { style: S.pageTitle }, text.title),
              h('div', { style: S.pageSub }, statusText),
            )
          : h(
              'div',
              { style: S.header, onClick: () => setExpanded((value) => !value), role: 'button', tabIndex: 0, onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') setExpanded((value) => !value) } },
              h('span', { style: S.dot }),
              h('span', { style: S.title }, text.title),
              h('span', { style: S.subtitle }, statusText),
              h('span', { style: S.meta }, expanded ? '▾' : '▸'),
            )

        if (!page && !expanded) return h('div', { style: S.card }, header)

        const imageBlock = image
          ? h(
              'div',
              { style: { ...S.drop, cursor: 'default', flexDirection: 'column' } },
              h('img', { src: image.dataUrl, alt: image.name, style: S.thumb }),
              h(
                'div',
                { style: { display: 'flex', gap: 10 } },
                h('button', { type: 'button', style: S.link, onClick: () => fileInput.current?.click() }, text.replace),
                h('button', { type: 'button', style: S.link, onClick: () => setImage(null) }, text.clear),
              ),
            )
          : h(
              'div',
              {
                style: S.drop,
                onClick: () => fileInput.current?.click(),
                onDragOver: (event) => {
                  event.preventDefault()
                  dragOver.current = true
                },
                onDrop: (event) => {
                  event.preventDefault()
                  dragOver.current = false
                  pick(event.dataTransfer?.files?.[0])
                },
              },
              h('span', null, text.drop),
            )

        const runningBlock =
          job && job.status === 'running'
            ? h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                h('div', { style: { ...S.meta, display: 'flex', gap: 8 } }, h('span', null, `${phaseLabel}${job.progress ? ` · ${progress}%` : ''}${jobElapsed ? ` · ${jobElapsed}` : ''}`)),
                h('div', { style: S.barTrack }, h('div', { style: { ...S.barFill, width: `${progress}%` } })),
              )
            : null

        const viewer =
          job && job.status !== 'running'
            ? h(
                'div',
                { style: S.overlay, onClick: () => setJob(null) },
                h(
                  'div',
                  { style: S.modal, onClick: (event) => event.stopPropagation() },
                  h(
                    'div',
                    { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                    h('span', { style: { fontWeight: 600 } }, text.preview),
                    h('span', { style: { ...S.meta, ...S.previewName, flex: 1 } }, job.file || ''),
                    h('button', { type: 'button', style: S.iconButton, title: 'Close preview', onClick: () => setJob(null) }, '\u00d7'),
                  ),
                  job.status === 'completed' && job.url
                    ? h('video', { src: job.url, style: S.modalVideo, controls: true, autoPlay: true, loop: true, playsInline: true })
                    : null,
                  job.status === 'failed' ? h('div', { style: S.error }, job.error || text.failed) : null,
                ),
              )
            : null

        const settingsBlock = settingsOpen
          ? h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2)' } },
              h('div', null, h('div', { style: S.label }, text.baseUrl), h('input', { style: { ...S.input, width: '100%', boxSizing: 'border-box' }, value: draft.baseUrl || '', onChange: (e) => setDraft({ ...draft, baseUrl: e.target.value }) })),
              h('div', null, h('div', { style: S.label }, text.model), h('input', { style: { ...S.input, width: '100%', boxSizing: 'border-box' }, value: draft.model || '', onChange: (e) => setDraft({ ...draft, model: e.target.value }) })),
              h('div', null, h('div', { style: S.label }, text.apiKey), h('input', { style: { ...S.input, width: '100%', boxSizing: 'border-box' }, type: 'password', placeholder: settings.hasApiKey ? text.apiKeySet : '', value: draft.apiKey || '', onChange: (e) => setDraft({ ...draft, apiKey: e.target.value }) })),
              h('div', null, h('div', { style: S.label }, text.outputDir), h('input', { style: { ...S.input, width: '100%', boxSizing: 'border-box' }, value: draft.outputDir || '', onChange: (e) => setDraft({ ...draft, outputDir: e.target.value }) })),
              h('div', { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } }, h('button', { type: 'button', style: S.primary, onClick: saveSettings }, text.save)),
            )
          : null

        const promptLabel = (item) => {
          const body = String(item.prompt || '').replace(/\s+/g, ' ').trim()
          return body || String(item.file || '')
        }
        const metaLabel = (item) => {
          if (item.status === 'running') {
            const elapsed = elapsedOf(item)
            return `${PHASE[item.phase] || 'Rendering'}${item.progress ? ` ${item.progress}%` : ''}${elapsed ? ` · ${elapsed}` : ''}`
          }
          if (item.status === 'failed') return 'Failed'
          return [item.size, item.seconds ? `${item.seconds}s` : ''].filter(Boolean).join(' ')
        }
        const statusColor = (item) =>
          item.status === 'completed'
            ? 'var(--dsw-alias-brand-primary)'
            : item.status === 'running'
              ? 'var(--dsw-alias-label-secondary)'
              : 'var(--dsw-alias-state-error-primary)'
        const clockLabel = (item) => {
          const stamp = Number(item.finishedAt || item.createdAt || 0)
          if (!stamp) return ''
          const d = new Date(stamp)
          const pad = (n) => String(n).padStart(2, '0')
          return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
        }

        const recentBlock = history.length
          ? h(
              'div',
              { style: S.recentPanel },
              h(
                'div',
                { style: S.recentHead },
                h('span', { style: S.recentTitle }, text.recent),
                h('span', { style: S.meta }, `${history.length}`),
              ),
              history.slice(0, 10).map((item, index) =>
                h(
                  'button',
                  {
                    key: item.id,
                    type: 'button',
                    title: item.error || item.file || '',
                    style: {
                      ...S.recentRow,
                      ...(index ? S.recentRowDivider : null),
                      ...(job?.id === item.id ? S.recentRowActive : null),
                    },
                    onClick: () => setJob(item),
                  },
                  h('span', { style: { ...S.dot, background: statusColor(item) } }),
                  h('span', { style: S.recentTime }, clockLabel(item)),
                  h('span', { style: S.recentPrompt }, promptLabel(item)),
                  h('span', { style: S.recentMeta }, metaLabel(item)),
                ),
              ),
            )
          : null

        return h(
          'div',
          { style: page ? S.page : S.card },
          header,
          h(
            'div',
            { style: S.body },
            settingsOpen ? null : h('div', null, h('div', { style: S.label }, text.prompt), h('textarea', { style: S.textarea, value: prompt, placeholder: text.promptPlaceholder, onChange: (e) => setPrompt(e.target.value) })),
            h('input', { ref: fileInput, type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: (e) => pick(e.target.files?.[0]) }),
            settingsOpen ? null : h('div', null, h('div', { style: S.label }, text.firstFrame), imageBlock),
            h(
              'div',
              { style: S.row },
              h(
                'div',
                { style: S.field },
                h('div', { style: S.label }, text.size),
                h('select', { style: { ...S.input, width: 132 }, value: settings.size, onChange: (e) => pickSize(e.target.value) }, sizeOptions.map((value) => h('option', { key: value, value }, value))),
              ),
              h(
                'div',
                { style: S.field },
                h('div', { style: S.label }, text.seconds),
                h('select', { style: { ...S.input, width: 92 }, value: settings.seconds, disabled: !durations.length, onChange: (e) => { setSettings({ ...settings, seconds: Number(e.target.value) }); setError('') } }, durations.map((value) => h('option', { key: value, value }, `${value}s`))),
              ),
              h('div', { style: { flex: 1 } }),
              h(
                'div',
                { style: S.actions },
                h('button', { type: 'button', style: S.ghost, onClick: () => setSettingsOpen((value) => !value) }, text.settings),
                busy ? h('button', { type: 'button', style: S.ghost, onClick: cancelJob }, text.cancel) : null,
                h('button', { type: 'button', style: { ...S.primary, minWidth: 136, opacity: busy ? 0.6 : 1, cursor: busy ? 'default' : 'pointer' }, disabled: busy, onClick: generate }, busy ? text.generating : text.generate),
              ),
            ),
            durationsHint ? h('div', { style: { ...S.meta, marginTop: -2 } }, durationsHint) : null,
            error ? h('div', { style: S.error }, error) : null,
            runningBlock,
            recentBlock,
            settingsBlock,
          ),
          viewer,
        )
      }
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: 'tiiny-video' }, Panel(ctx, true)),
        )
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: 'tiiny-video', order: 20, label: () => 'Tiiny Video' }, PanelIcon),
        )
      },
    }
  },
})
