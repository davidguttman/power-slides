const h = require('hyperscript')
const QRCode = require('qrcode-generator')

const DEFAULT_QUERY_PARAM = 'ps-remote'
const DEFAULT_PAIR_PARAM = 'ps-pair'
const DEFAULT_BUTTON_HIDE_MS = 5000
const CLIENT_ID_STORAGE_KEY = 'power-slides.remote.clientId'
const CONTROLLER_STORAGE_PREFIX = 'power-slides.remote.controllerId'

module.exports = createRemote
module.exports.isOptionsKey = isOptionsKey
module.exports.hasControllerUrl = hasControllerUrl
module.exports._test = {
  DEFAULT_QUERY_PARAM,
  DEFAULT_PAIR_PARAM,
  DEFAULT_BUTTON_HIDE_MS,
  CLIENT_ID_STORAGE_KEY,
  CONTROLLER_STORAGE_PREFIX,
  acceptDeckHello,
  buildHelloMessage,
  clampSlideNumber,
  createQrSvg,
  generateId,
  getControllerStorageKey,
  handleControllerClose,
  handleControllerData,
  getPreviewSlideKind,
  getPreviewSlideModel,
  getPreviewSlideNumbers,
  markPeerUnavailable,
  normalizePeerExport,
  getOrCreateClientId,
  getPairKey,
  getQueryParamFromSearch,
  getRemoteId,
  getRemoteUrl,
  getGotoHash,
  isEditableTarget,
  isOptionsKey
}

function createRemote (PS, opts) {
  opts = opts || {}

  const state = {
    opts,
    role: getRemoteId(opts) ? 'controller' : (opts.role || 'deck'),
    peer: null,
    deckConnection: null,
    connections: [],
    activeConnection: null,
    controllerId: null,
    clientId: null,
    peerId: null,
    pairKey: null,
    remoteUrl: null,
    remoteEnabled: false,
    status: 'Remote control disabled',
    overlay: null,
    button: null,
    slideNumber: PS.getCurrentSlideNumber(),
    slideCount: PS.slides.length,
    notes: []
  }

  state.openOptions = function () {
    showRemoteOptions(PS, state)
  }

  state.closeOptions = function () {
    if (!state.overlay) return
    state.overlay.parentNode.removeChild(state.overlay)
    state.overlay = null
  }

  state.enableRemote = function () {
    if (state.role === 'controller' || state.remoteEnabled) return
    state.remoteEnabled = true
    state.pairKey = state.opts.pairKey || generateId('pair')
    state.status = 'Starting remote...'
    startDeckRemote(PS, state)
    updateRemoteOptions(PS, state)
  }

  createRemoteButton(state)

  if (state.role === 'controller') {
    startControllerRemote(PS, state)
  }

  return state
}

function startDeckRemote (PS, state) {
  const Peer = loadPeer(state.opts)
  if (!Peer) {
    markPeerUnavailable(state)
    updateRemoteOptions(PS, state)
    return
  }

  state.peer = new Peer(state.opts.peerId, state.opts.peerOptions)

  state.peer.on('open', function (id) {
    state.peerId = id
    state.controllerId = getStoredControllerId(state)
    state.remoteUrl = getRemoteUrl(id, state.opts, window.location.href, window.location.hash, state.pairKey)
    state.status = 'Remote ready'
    updateRemoteOptions(PS, state)
  })

  state.peer.on('connection', function (conn) {
    conn._psAccepted = false

    conn.on('open', function () {
      updateRemoteOptions(PS, state)
    })

    conn.on('data', function (message) {
      if (!conn._psAccepted) {
        if (!message || message.type !== 'hello') {
          rejectConnection(conn)
          return
        }

        if (!acceptDeckHello(state, conn, message)) {
          state.status = 'Remote locked'
          updateRemoteOptions(PS, state)
          return
        }

        conn._psAccepted = true
        state.status = 'Remote connected'
        sendDeckState(PS, conn)
        updateRemoteOptions(PS, state)
        return
      }

      if (conn !== state.activeConnection) return
      handleRemoteCommand(PS, conn, message)
    })

    conn.on('close', function () {
      removeConnection(state, conn)
      state.status = state.activeConnection ? 'Remote connected' : 'Remote ready'
      updateRemoteOptions(PS, state)
    })
  })

  state.peer.on('error', function (err) {
    state.status = err && err.message ? err.message : 'Remote error'
    updateRemoteOptions(PS, state)
  })

  PS.on('changeSlide', function () {
    broadcastDeckState(PS, state)
  })
}

function startControllerRemote (PS, state) {
  const deckId = getRemoteId(state.opts)

  state.clientId = getOrCreateClientId(getBrowserStorage('localStorage'), CLIENT_ID_STORAGE_KEY)
  state.pairKey = getPairKey(state.opts)
  state.status = 'Connecting to deck...'
  showRemoteOptions(PS, state)

  const Peer = loadPeer(state.opts)
  if (!Peer) {
    markPeerUnavailable(state)
    updateRemoteOptions(PS, state)
    return
  }

  state.peer = new Peer(state.opts.peerId, state.opts.peerOptions)

  state.peer.on('open', function () {
    state.deckConnection = state.peer.connect(deckId, { reliable: true })

    state.deckConnection.on('open', function () {
      state.status = 'Connected to deck'
      state.deckConnection.send(buildHelloMessage(state.pairKey, state.clientId))
      updateRemoteOptions(PS, state)
    })

    state.deckConnection.on('data', function (message) {
      if (!message) return

      if (handleControllerData(state, message)) updateRemoteOptions(PS, state)
    })

    state.deckConnection.on('close', function () {
      handleControllerClose(state)
      updateRemoteOptions(PS, state)
    })
  })

  state.peer.on('error', function (err) {
    state.status = err && err.message ? err.message : 'Remote error'
    updateRemoteOptions(PS, state)
  })
}

function loadPeer (opts) {
  opts = opts || {}

  if (opts.Peer) return normalizePeerExport(opts.Peer)
  if (typeof window !== 'undefined' && window.Peer) return normalizePeerExport(window.Peer)

  return null
}

function normalizePeerExport (Peer) {
  if (!Peer) return null
  if (typeof Peer === 'function') return Peer
  if (typeof Peer.Peer === 'function') return Peer.Peer
  if (typeof Peer.default === 'function') return Peer.default
  if (Peer.default && typeof Peer.default.Peer === 'function') return Peer.default.Peer
  return null
}

function markPeerUnavailable (state) {
  state.remoteEnabled = false
  state.status = 'PeerJS unavailable. Load PeerJS and try again.'
}

function handleControllerData (state, message) {
  if (!message) return false

  if (message.type === 'locked') {
    state.deckLocked = true
    state.status = 'Deck locked to another controller'
    return true
  }

  if (message.type !== 'state') return false
  state.slideNumber = message.slideNumber
  state.slideCount = message.slideCount
  state.notes = message.notes || []
  return true
}

function handleControllerClose (state) {
  if (state.deckLocked) {
    state.status = 'Deck locked to another controller'
    return
  }

  state.status = 'Disconnected from deck'
}

function acceptDeckHello (state, conn, message) {
  const clientId = message && message.clientId
  if (!clientId) return rejectConnection(conn)

  const storedControllerId = state.controllerId || getStoredControllerId(state)

  if (storedControllerId) {
    state.controllerId = storedControllerId
    if (clientId !== storedControllerId) return rejectConnection(conn)
  } else {
    if (!state.pairKey || message.pairKey !== state.pairKey) return rejectConnection(conn)
    state.controllerId = clientId
    setStoredControllerId(state, clientId)
  }

  if (state.activeConnection && state.activeConnection !== conn) {
    closeConnection(state.activeConnection)
    removeConnection(state, state.activeConnection)
  }

  state.activeConnection = conn
  if (state.connections.indexOf(conn) === -1) state.connections.push(conn)
  return true
}

function rejectConnection (conn) {
  sendConnection(conn, { type: 'locked' })
  closeConnection(conn)
  return false
}

function removeConnection (state, conn) {
  state.connections = state.connections.filter(function (item) {
    return item !== conn
  })

  if (state.activeConnection === conn) state.activeConnection = null
}

function closeConnection (conn) {
  if (!conn || typeof conn.close !== 'function') return
  conn.close()
}

function sendConnection (conn, message) {
  if (!conn || typeof conn.send !== 'function') return
  if (conn.open === false) return
  conn.send(message)
}

function handleRemoteCommand (PS, conn, message) {
  if (!message || message.type !== 'command') return

  if (message.command === 'next') PS.nextSlide()
  if (message.command === 'prev') PS.prevSlide()
  if (message.command === 'goto') window.location.hash = getGotoHash(message.slideNumber, PS.slides.length)

  sendDeckState(PS, conn)
}

function broadcastDeckState (PS, state) {
  if (state.activeConnection) sendDeckState(PS, state.activeConnection)
  updateRemoteOptions(PS, state)
}

function sendDeckState (PS, conn) {
  sendConnection(conn, {
    type: 'state',
    slideNumber: clampSlideNumber(PS.getCurrentSlideNumber(), PS.slides.length),
    slideCount: PS.slides.length,
    notes: PS.notes[clampSlideNumber(PS.getCurrentSlideNumber(), PS.slides.length) - 1] || []
  })
}

function createRemoteButton (state) {
  state.button = h('button.ps-remote-options-button', {
    type: 'button',
    onclick: state.openOptions,
    title: 'Open power-slides options (o)',
    style: {
      position: 'fixed',
      right: '16px',
      bottom: '16px',
      'z-index': 2147483646,
      padding: '10px 12px',
      border: '1px solid rgba(255, 255, 255, 0.35)',
      'border-radius': '999px',
      background: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      cursor: 'pointer',
      transition: 'opacity 180ms ease',
      opacity: 1
    }
  }, 'Options')

  document.body.appendChild(state.button)

  setTimeout(function () {
    if (!state.button) return
    state.button.style.opacity = 0
    state.button.style.pointerEvents = 'none'
  }, state.opts.buttonHideMs || DEFAULT_BUTTON_HIDE_MS)
}

function showRemoteOptions (PS, state) {
  if (state.overlay) return updateRemoteOptions(PS, state)

  state.overlay = h('.ps-remote-options', {
    style: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      'z-index': 2147483647,
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      background: 'rgba(0, 0, 0, 0.78)',
      color: 'white',
      'font-family': 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
      'font-size': '16px'
    }
  })

  document.body.appendChild(state.overlay)
  updateRemoteOptions(PS, state)
}

function updateRemoteOptions (PS, state) {
  if (!state.overlay) return

  state.overlay.innerHTML = ''
  state.overlay.appendChild(remoteOptionsPanel(PS, state))
}

function remoteOptionsPanel (PS, state) {
  const close = h('button', {
    type: 'button',
    onclick: state.closeOptions,
    style: remoteButtonStyle()
  }, 'Close')

  const panel = h('div', {
    style: {
      width: 'min(620px, calc(100vw - 32px))',
      'max-height': 'calc(100vh - 32px)',
      overflow: 'auto',
      padding: '24px',
      background: '#111',
      border: '1px solid rgba(255, 255, 255, 0.2)',
      'border-radius': '16px',
      'box-shadow': '0 16px 60px rgba(0, 0, 0, 0.55)'
    }
  }, [
    h('div', {
      style: {
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'space-between',
        gap: '16px'
      }
    }, [
      h('h2', { style: { margin: 0 } }, 'power-slides options'),
      close
    ]),
    h('p', { style: { color: '#bbb' } }, 'Press “o” any time to reopen this overlay.'),
    remoteStatusView(state)
  ])

  if (state.role === 'controller') panel.appendChild(controllerView(PS, state))
  if (state.role !== 'controller') panel.appendChild(deckView(state))

  return panel
}

function remoteStatusView (state) {
  return h('p', { style: { margin: '16px 0' } }, [
    h('strong', 'Status: '),
    state.status
  ])
}

function deckView (state) {
  if (!state.remoteEnabled) {
    return h('div', [
      h('h3', { style: { margin: '20px 0 8px' } }, 'Remote control'),
      h('p', 'Remote control is off until you enable it for this browser session.'),
      h('button', {
        type: 'button',
        onclick: state.enableRemote,
        style: remoteButtonStyle()
      }, 'Enable remote control')
    ])
  }

  return h('div', [
    h('h3', { style: { margin: '20px 0 8px' } }, 'Remote control'),
    state.remoteUrl
      ? h('div', [
        h('p', 'Open this URL on your phone or another device:'),
        qrCodeView(state.remoteUrl),
        h('p', [
          h('a', {
            href: state.remoteUrl,
            target: '_blank',
            style: { color: '#8bd3ff', 'word-break': 'break-all' }
          }, state.remoteUrl)
        ]),
        h('p', { style: { color: '#bbb' } }, 'Connections: ' + state.connections.length)
      ])
      : h('p', 'Creating remote URL...')
  ])
}

function qrCodeView (url) {
  const wrapper = h('div', {
    style: {
      display: 'inline-block',
      padding: '12px',
      background: 'white',
      'border-radius': '8px'
    }
  })

  wrapper.innerHTML = createQrSvg(url)
  return wrapper
}

function controllerView (PS, state) {
  return h('div', [
    h('h3', { style: { margin: '20px 0 8px' } }, 'Controller'),
    h('p', 'Slide ' + state.slideNumber + ' of ' + state.slideCount),
    controllerPreviewsView(PS, state),
    h('div', { style: { display: 'flex', gap: '12px', 'margin-bottom': '18px' } }, [
      h('button', { type: 'button', onclick: sendRemoteCommand(state, 'prev'), style: remoteButtonStyle() }, 'Previous'),
      h('button', { type: 'button', onclick: sendRemoteCommand(state, 'next'), style: remoteButtonStyle() }, 'Next')
    ]),
    notesView(state.notes)
  ])
}

function controllerPreviewsView (PS, state) {
  const numbers = getPreviewSlideNumbers(state.slideNumber, state.slideCount)

  return h('div.ps-controller-previews', {
    style: {
      display: 'grid',
      gap: '12px',
      margin: '14px 0 18px'
    }
  }, [
    slidePreviewCard(PS, numbers.current, numbers.slideCount, 'Current', 'current'),
    slidePreviewCard(PS, numbers.next, numbers.slideCount, 'Next', 'next')
  ])
}

function slidePreviewCard (PS, slideNumber, slideCount, label, variant) {
  const isNext = variant === 'next'
  const body = h('div.ps-controller-preview-body', {
    style: {
      height: isNext ? '112px' : '184px',
      overflow: 'hidden',
      position: 'relative',
      background: '#050505',
      border: '1px solid rgba(255, 255, 255, 0.14)',
      'border-radius': '12px'
    }
  })

  renderSlidePreview(PS && PS.slides, slideNumber, body, {
    emptyText: isNext ? 'No next slide' : 'No current slide'
  })

  return h('section.ps-controller-preview-card', {
    style: {
      padding: isNext ? '10px' : '12px',
      background: 'rgba(255, 255, 255, 0.07)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      'border-radius': '14px'
    }
  }, [
    h('div', {
      style: {
        display: 'flex',
        'align-items': 'baseline',
        'justify-content': 'space-between',
        gap: '8px',
        margin: '0 0 8px'
      }
    }, [
      h('strong', label),
      h('span', { style: { color: '#bbb', 'font-size': '13px' } }, slideNumber ? ('Slide ' + slideNumber + ' of ' + slideCount) : 'End')
    ]),
    body
  ])
}

function renderSlidePreview (slides, slideNumber, target, opts) {
  opts = opts || {}
  if (!target) return

  target.innerHTML = ''
  const model = getPreviewSlideModel(slides, slideNumber)

  if (!model.available) {
    target.appendChild(previewPlaceholder(opts.emptyText || model.message || 'Preview unavailable'))
    return
  }

  try {
    if (model.kind === 'string') {
      renderStringSlidePreview(target, model.slide)
      return
    }

    if (model.kind === 'dom') {
      target.appendChild(model.slide.cloneNode(true))
      return
    }

    if (model.kind === 'function') {
      model.slide(target)
      if (!target.childNodes.length) target.appendChild(previewPlaceholder('Preview unavailable'))
      return
    }

    target.appendChild(previewPlaceholder(String(model.slide)))
  } catch (err) {
    target.innerHTML = ''
    target.appendChild(previewPlaceholder('Preview unavailable'))
  }
}

function renderStringSlidePreview (target, title) {
  target.appendChild(h('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'box-sizing': 'border-box',
      padding: '10%',
      'text-align': 'center'
    }
  }, h('h1', {
    style: {
      margin: 0,
      'font-size': 'clamp(20px, 8vw, 42px)',
      'line-height': 1.05
    }
  }, title)))
}

function previewPlaceholder (text) {
  return h('div', {
    style: {
      width: '100%',
      height: '100%',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'box-sizing': 'border-box',
      padding: '16px',
      color: '#bbb',
      'text-align': 'center'
    }
  }, text)
}

function notesView (notes) {
  if (!notes || !notes.length) return h('p', { style: { color: '#bbb' } }, 'No notes for this slide.')

  return h('div', [
    h('h4', { style: { margin: '12px 0 8px' } }, 'Notes'),
    h('div', notes.map(function (note) {
      return h('p', { style: { margin: '0 0 8px' } }, note)
    }))
  ])
}

function sendRemoteCommand (state, command) {
  return function () {
    if (!state.deckConnection || !state.deckConnection.open) return
    state.deckConnection.send({ type: 'command', command })
  }
}

function remoteButtonStyle () {
  return {
    padding: '10px 14px',
    border: '1px solid rgba(255, 255, 255, 0.35)',
    'border-radius': '10px',
    background: 'rgba(255, 255, 255, 0.12)',
    color: 'white',
    cursor: 'pointer'
  }
}

function hasControllerUrl (opts) {
  return Boolean(getRemoteId(opts || {}))
}

function getRemoteId (opts) {
  opts = opts || {}
  return opts.remoteId || getQueryParamFromSearch(opts.param || DEFAULT_QUERY_PARAM, getBrowserSearch())
}

function getPairKey (opts) {
  opts = opts || {}
  return opts.pairKey || getQueryParamFromSearch(opts.pairParam || DEFAULT_PAIR_PARAM, getBrowserSearch())
}

function getBrowserSearch () {
  if (typeof window === 'undefined' || !window.location) return ''
  return window.location.search
}

function getBrowserStorage (name) {
  try {
    if (typeof window === 'undefined') return null
    return window[name]
  } catch (err) {
    return null
  }
}

function getQueryParamFromSearch (name, search) {
  const rawSearch = String(search || '').replace(/^\?/, '')

  if (typeof URLSearchParams !== 'undefined') {
    try {
      return new URLSearchParams(rawSearch).get(name) || ''
    } catch (err) {}
  }

  const query = rawSearch.split('&')
  let value = ''

  query.forEach(function (part) {
    const pair = splitQueryPart(part)
    if (safeDecode(pair[0]) === name) value = safeDecode(pair[1])
  })

  return value
}

function getRemoteUrl (peerId, opts, href, hash, pairKey) {
  opts = opts || {}

  const remoteParam = opts.param || DEFAULT_QUERY_PARAM
  const pairParam = opts.pairParam || DEFAULT_PAIR_PARAM
  const url = String(href || '').split('#')[0]
  const cleanUrl = stripQueryParams(url, [remoteParam, pairParam])
  const params = [
    [remoteParam, peerId],
    [pairParam, pairKey]
  ]

  return appendQueryParams(cleanUrl, params) + (hash || '')
}

function appendQueryParams (url, params) {
  const join = url.indexOf('?') === -1 ? '?' : '&'
  return url + join + params.map(function (pair) {
    return encodeURIComponent(pair[0]) + '=' + encodeURIComponent(pair[1] || '')
  }).join('&')
}

function stripQueryParams (url, params) {
  const parts = String(url || '').split('?')
  if (parts.length === 1) return url

  const query = parts[1].split('&').filter(function (part) {
    const pair = splitQueryPart(part)
    return params.indexOf(safeDecode(pair[0])) === -1
  }).join('&')

  return parts[0] + (query ? '?' + query : '')
}

function splitQueryPart (part) {
  const text = String(part || '')
  const index = text.indexOf('=')
  if (index === -1) return [text, '']
  return [text.slice(0, index), text.slice(index + 1)]
}

function safeDecode (value) {
  try {
    return decodeURIComponent(String(value || '').replace(/\+/g, ' '))
  } catch (err) {
    return String(value || '')
  }
}

function buildHelloMessage (pairKey, clientId) {
  return {
    type: 'hello',
    pairKey,
    clientId
  }
}

function getOrCreateClientId (storage, key) {
  key = key || CLIENT_ID_STORAGE_KEY

  const existing = storageGet(storage, key)
  if (existing) return existing

  const clientId = generateId('client')
  storageSet(storage, key, clientId)
  return clientId
}

function getControllerStorageKey (opts) {
  opts = opts || {}
  if (opts.controllerStorageKey) return opts.controllerStorageKey

  return [
    CONTROLLER_STORAGE_PREFIX,
    stableDeckIdentity(opts)
  ].join(':')
}

function stableDeckIdentity (opts) {
  const loc = opts.location || (typeof window !== 'undefined' && window.location)
  if (!loc) return 'deck'
  if (typeof loc === 'string') return stableDeckIdentityFromUrl(loc)

  return (loc.origin || '') + (loc.pathname || '') || stableDeckIdentityFromUrl(loc.href)
}

function stableDeckIdentityFromUrl (href) {
  const text = String(href || '').split('#')[0]
  const parts = text.split('?')
  return parts[0] || 'deck'
}

function getStoredControllerId (state) {
  const storage = state.opts.sessionStorage || getBrowserStorage('sessionStorage')
  return storageGet(storage, getControllerStorageKey(state.opts))
}

function setStoredControllerId (state, controllerId) {
  const storage = state.opts.sessionStorage || getBrowserStorage('sessionStorage')
  storageSet(storage, getControllerStorageKey(state.opts), controllerId)
}

function storageGet (storage, key) {
  try {
    if (!storage || !storage.getItem) return ''
    return storage.getItem(key) || ''
  } catch (err) {
    return ''
  }
}

function storageSet (storage, key, value) {
  try {
    if (!storage || !storage.setItem) return
    storage.setItem(key, value)
  } catch (err) {}
}

function generateId (prefix, cryptoLike) {
  const crypto = cryptoLike || getCrypto()

  if (crypto && typeof crypto.randomUUID === 'function') {
    return (prefix || 'id') + '-' + crypto.randomUUID()
  }

  if (crypto && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return (prefix || 'id') + '-' + Array.prototype.map.call(bytes, function (byte) {
      return byte.toString(16).padStart(2, '0')
    }).join('')
  }

  const random = Math.random().toString(36).slice(2, 10)
  const now = Date.now().toString(36)
  return (prefix || 'id') + '-' + now + '-' + random
}

function getCrypto () {
  if (typeof globalThis !== 'undefined' && globalThis.crypto) return globalThis.crypto
  if (typeof window !== 'undefined' && window.crypto) return window.crypto
  return null
}

function getPreviewSlideNumbers (slideNumber, slideCount) {
  const count = Math.max(0, parseInt(slideCount, 10) || 0)

  if (count < 1) {
    return {
      current: null,
      next: null,
      slideCount: 0
    }
  }

  const current = clampSlideNumber(slideNumber, count)

  return {
    current,
    next: current < count ? current + 1 : null,
    slideCount: count
  }
}

function getPreviewSlideModel (slides, slideNumber) {
  const list = Array.isArray(slides) ? slides : []
  const parsed = parseInt(slideNumber, 10)

  if (!isFinite(parsed) || parsed < 1 || parsed > list.length) {
    return {
      available: false,
      kind: 'empty',
      slideNumber: null,
      slide: null,
      message: 'No next slide'
    }
  }

  const slide = list[parsed - 1]

  if (slide == null) {
    return {
      available: false,
      kind: 'missing',
      slideNumber: parsed,
      slide,
      message: 'Slide unavailable'
    }
  }

  return {
    available: true,
    kind: getPreviewSlideKind(slide),
    slideNumber: parsed,
    slide,
    message: ''
  }
}

function getPreviewSlideKind (slide) {
  if (typeof slide === 'string') return 'string'
  if (typeof slide === 'function') return 'function'
  if (isCloneableDomNode(slide)) return 'dom'
  return 'fallback'
}

function isCloneableDomNode (value) {
  return Boolean(value && typeof value.cloneNode === 'function' && typeof value.nodeType === 'number')
}

function clampSlideNumber (slideNumber, slideCount) {
  const max = Math.max(1, parseInt(slideCount, 10) || 1)
  const parsed = parseInt(slideNumber, 10)
  if (!isFinite(parsed)) return 1
  if (parsed < 1) return 1
  if (parsed > max) return max
  return parsed
}

function getGotoHash (slideNumber, slideCount) {
  return '/' + clampSlideNumber(slideNumber, slideCount)
}

function createQrSvg (text) {
  const qr = QRCode(0, 'M')
  qr.addData(String(text || ''))
  qr.make()
  return qr.createSvgTag(5, 1)
}

function isOptionsKey (evt) {
  if (!evt || evt.metaKey || evt.ctrlKey || evt.altKey) return false
  if (isEditableTarget(evt.target)) return false

  return evt.key === 'o' || evt.key === 'O'
}

function isEditableTarget (target) {
  if (!target) return false
  const tag = target.tagName && target.tagName.toLowerCase()

  return target.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select'
}
