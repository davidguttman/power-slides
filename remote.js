const h = require('hyperscript')
const QRCode = require('qrcode-generator')
const PACKAGE_VERSION = require('./package.json').version

const DEFAULT_QUERY_PARAM = 'ps-remote'
const DEFAULT_PAIR_PARAM = 'ps-pair'
const DEFAULT_BUTTON_HIDE_MS = 5000
const DEFAULT_RECONNECT_MS = 1000
const CLIENT_ID_STORAGE_KEY = 'power-slides.remote.clientId'
const CONTROLLER_STORAGE_PREFIX = 'power-slides.remote.controllerId'
const DECK_PEER_ID_STORAGE_PREFIX = 'power-slides.remote.deckPeerId'
const DECK_REMOTE_ENABLED_STORAGE_PREFIX = 'power-slides.remote.enabled'
const PREVIEW_BASE_WIDTH = 1280
const PREVIEW_BASE_HEIGHT = 720
const PREVIEW_ASPECT_RATIO = PREVIEW_BASE_WIDTH + ' / ' + PREVIEW_BASE_HEIGHT
const CONTROLLER_NOTES_MAX_HEIGHT = 'min(22vh, 180px)'
const DEFAULT_CONTROLLER_SLIDE_DURATION_SECONDS = 75

module.exports = createRemote
module.exports.isOptionsKey = isOptionsKey
module.exports.hasControllerUrl = hasControllerUrl
module.exports._test = {
  DEFAULT_QUERY_PARAM,
  DEFAULT_PAIR_PARAM,
  DEFAULT_BUTTON_HIDE_MS,
  DEFAULT_RECONNECT_MS,
  CLIENT_ID_STORAGE_KEY,
  CONTROLLER_STORAGE_PREFIX,
  DECK_PEER_ID_STORAGE_PREFIX,
  DECK_REMOTE_ENABLED_STORAGE_PREFIX,
  PREVIEW_ASPECT_RATIO,
  PREVIEW_BASE_HEIGHT,
  PREVIEW_BASE_WIDTH,
  CONTROLLER_NOTES_MAX_HEIGHT,
  DEFAULT_CONTROLLER_SLIDE_DURATION_SECONDS,
  PACKAGE_VERSION,
  acceptDeckHello,
  buildHelloMessage,
  clampSlideNumber,
  createQrSvg,
  generateId,
  connectControllerDeck,
  getRemoteOverlayStyle,
  getRemoteOptionsPanelStyle,
  getControllerStorageKey,
  getControllerControlsStyle,
  getControllerNotesBodyStyle,
  getControllerNotesCardStyle,
  getControllerNotesLines,
  getControllerPreviewsStyle,
  getControllerPreviewCardStyle,
  getControllerTimerSeconds,
  getControllerSlideTimerSeconds,
  getEstimatedControllerTalkDurationSeconds,
  getEstimatedControllerSlidePaceSeconds,
  getControllerSlidePositionText,
  getControllerStatusColor,
  getControllerStatusTone,
  getControllerViewStyle,
  updateControllerNotesLayer,
  updateControllerTimerDisplays,
  getDeckPeerId,
  getDeckPeerIdStorageKey,
  getDeckRemoteEnabledStorageKey,
  clearStoredDeckPeerId,
  recoverDeckPeerId,
  isDeckPeerIdCollisionError,
  handleControllerClose,
  hasControllerNotes,
  isDeckRemoteEnabled,
  handleControllerData,
  formatControllerTimer,
  formatControllerSlideTimer,
  formatControllerTalkTimer,
  formatControllerTalkTimerDisplay,
  formatControllerTalkEstimate,
  getRobustCompletedSlideDurationSeconds,
  getPreviewStageScale,
  getPreviewStageStyle,
  getPreviewStageTransform,
  getPreviewSlideKind,
  getPreviewSlideModel,
  getPreviewSlideNumbers,
  getPreviewViewportStyle,
  markPeerUnavailable,
  normalizePeerExport,
  getOrCreateClientId,
  getPairKey,
  getQueryParamFromSearch,
  getRemoteId,
  getRemoteUrl,
  getGotoHash,
  scheduleControllerReconnect,
  storeDeckRemoteEnabled,
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
    deckId: null,
    peerId: null,
    pairKey: null,
    remoteUrl: null,
    remoteEnabled: false,
    status: 'Remote control disabled',
    deckLocked: false,
    reconnectTimer: null,
    reconnectAttempts: 0,
    timerStartedAt: null,
    timerNow: null,
    slideTimerStartedAt: null,
    slideTimerNow: null,
    completedSlideDurations: [],
    timerInterval: null,
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
    storeDeckRemoteEnabled(state)
    state.pairKey = state.opts.pairKey || generateId('pair')
    state.status = 'Starting remote...'
    startDeckRemote(PS, state)
    updateRemoteOptions(PS, state)
  }

  createRemoteButton(state)

  if (state.role === 'controller') {
    startControllerRemote(PS, state)
  } else if (state.role === 'deck' && isDeckRemoteEnabled(state.opts)) {
    state.enableRemote()
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

  openDeckPeer(PS, state, Peer)

  PS.on('changeSlide', function () {
    broadcastDeckState(PS, state)
  })
}

function openDeckPeer (PS, state, Peer) {
  state.peer = new Peer(getDeckPeerId(state), state.opts.peerOptions)

  state.peer.on('open', function (id) {
    state.peerId = id
    storeDeckPeerId(state, id)
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
    if (recoverDeckPeerId(PS, state, err, Peer)) return

    state.status = err && err.message ? err.message : 'Remote error'
    updateRemoteOptions(PS, state)
  })
}

function startControllerRemote (PS, state) {
  state.deckId = getRemoteId(state.opts)
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
    connectControllerDeck(PS, state)
  })

  state.peer.on('error', function (err) {
    state.status = err && err.message ? err.message : 'Remote error'
    if (state.role === 'controller') scheduleControllerReconnect(PS, state)
    updateRemoteOptions(PS, state)
  })
}

function connectControllerDeck (PS, state) {
  if (!state || !state.peer || state.deckLocked) return null

  clearControllerReconnect(state)
  state.status = state.reconnectAttempts ? 'Reconnecting to deck...' : 'Connecting to deck...'

  const conn = state.peer.connect(state.deckId, { reliable: true })
  state.deckConnection = conn

  conn.on('open', function () {
    if (state.deckConnection !== conn) return

    clearControllerReconnect(state)
    state.reconnectAttempts = 0
    state.status = 'Connected to deck'
    conn.send(buildHelloMessage(state.pairKey, state.clientId))
    updateRemoteOptions(PS, state)
  })

  conn.on('data', function (message) {
    if (state.deckConnection !== conn) return
    if (!message) return

    if (handleControllerData(state, message)) {
      ensureControllerTimerInterval(PS, state)
      if (state.controllerPreviewDirty === false) {
        updateControllerTimerDisplays(state)
        updateControllerNotesLayer(state)
      } else {
        updateRemoteOptions(PS, state)
      }
    }
  })

  conn.on('close', function () {
    if (state.deckConnection !== conn) return

    state.deckConnection = null
    handleControllerClose(state)
    scheduleControllerReconnect(PS, state)
    updateRemoteOptions(PS, state)
  })

  if (typeof conn.on === 'function') {
    conn.on('error', function (err) {
      if (state.deckConnection !== conn) return

      state.status = err && err.message ? err.message : 'Remote connection error'
      state.deckConnection = null
      closeConnection(conn)
      scheduleControllerReconnect(PS, state)
      updateRemoteOptions(PS, state)
    })
  }

  updateRemoteOptions(PS, state)
  return conn
}

function scheduleControllerReconnect (PS, state) {
  if (!state || state.deckLocked || state.reconnectTimer) return false
  if (!state.peer || !state.deckId) return false

  state.reconnectAttempts = (state.reconnectAttempts || 0) + 1
  state.status = 'Reconnecting to deck...'
  state.reconnectTimer = setControllerTimer(state, function () {
    state.reconnectTimer = null
    connectControllerDeck(PS, state)
  }, getControllerReconnectMs(state.opts))

  return true
}

function clearControllerReconnect (state) {
  if (!state || !state.reconnectTimer) return

  clearControllerTimer(state, state.reconnectTimer)
  state.reconnectTimer = null
}

function getControllerReconnectMs (opts) {
  opts = opts || {}
  const parsed = parseInt(opts.reconnectMs, 10)
  return isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_RECONNECT_MS
}

function setControllerTimer (state, callback, delay) {
  const setTimer = state.opts && state.opts.setTimeout ? state.opts.setTimeout : setTimeout
  return setTimer(callback, delay)
}

function clearControllerTimer (state, timer) {
  const clearTimer = state.opts && state.opts.clearTimeout ? state.opts.clearTimeout : clearTimeout
  clearTimer(timer)
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
    state.controllerPreviewDirty = true
    return true
  }

  if (message.type !== 'state') return false

  if (!Array.isArray(state.completedSlideDurations)) state.completedSlideDurations = []

  const previousSlideNumber = state.slideNumber
  const previousSlideCount = state.slideCount
  const nextSlideNumber = message.slideNumber
  const nextSlideCount = message.slideCount
  const now = getControllerNow(state)
  const slideChanged = nextSlideNumber !== previousSlideNumber
  const slideCountChanged = nextSlideCount !== previousSlideCount

  if (slideChanged && state.timerStartedAt != null) {
    recordControllerCompletedSlideDuration(state, previousSlideNumber, state.slideTimerStartedAt, now)
  }

  if (state.timerStartedAt != null) state.timerNow = now

  if (state.slideTimerStartedAt == null || slideChanged) {
    state.slideTimerStartedAt = now
  }

  state.slideTimerNow = now
  state.slideNumber = nextSlideNumber
  state.slideCount = nextSlideCount
  state.notes = message.notes || []
  state.controllerPreviewDirty = slideChanged || slideCountChanged
  return true
}

function recordControllerCompletedSlideDuration (state, slideNumber, startedAt, endedAt) {
  if (!state || startedAt == null || endedAt == null || endedAt < startedAt) return false

  const parsedSlideNumber = parseInt(slideNumber, 10)
  if (!parsedSlideNumber || parsedSlideNumber < 1) return false

  const durationSeconds = Math.floor((endedAt - startedAt) / 1000)
  if (durationSeconds <= 0) return false

  if (!Array.isArray(state.completedSlideDurations)) state.completedSlideDurations = []
  state.completedSlideDurations.push({
    slideNumber: parsedSlideNumber,
    durationSeconds
  })
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
  if (typeof state.closeOptions === 'function') state.closeOptions()
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
  if (state.role === 'controller') return

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
    style: getRemoteOverlayStyle(state.role === 'controller')
  })

  document.body.appendChild(state.overlay)
  updateRemoteOptions(PS, state)
}

function updateRemoteOptions (PS, state) {
  if (!state.overlay) return

  state.overlay.innerHTML = ''
  state.overlay.appendChild(remoteOptionsPanel(PS, state))
}

function getRemoteOverlayStyle (isController) {
  return {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    'z-index': 2147483647,
    display: 'flex',
    'align-items': 'center',
    'justify-content': 'center',
    background: isController ? '#000' : 'rgba(0, 0, 0, 0.78)',
    color: 'white',
    'font-family': 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    'font-size': '16px',
    'overscroll-behavior': 'none',
    'touch-action': 'manipulation'
  }
}

function remoteOptionsPanel (PS, state) {
  const isController = state.role === 'controller'
  const children = []

  if (isController) {
    children.push(controllerView(PS, state))
  } else {
    const close = h('button', {
      type: 'button',
      onclick: state.closeOptions,
      style: remoteButtonStyle()
    }, 'Close')

    children.push(
      h('div', {
        style: {
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'space-between',
          gap: '16px'
        }
      }, [
        h('div', {
          style: {
            display: 'flex',
            'align-items': 'baseline',
            gap: '10px',
            'flex-wrap': 'wrap'
          }
        }, [
          h('h2', { style: { margin: 0 } }, 'power-slides options'),
          h('span', {
            style: {
              color: '#aaa',
              'font-size': '0.9em'
            }
          }, 'v' + PACKAGE_VERSION)
        ]),
        close
      ]),
      h('p', { style: { color: '#bbb' } }, 'Press “o” any time to reopen this overlay.'),
      remoteStatusView(state),
      deckView(state)
    )
  }

  return h('div', {
    style: getRemoteOptionsPanelStyle(isController)
  }, children)
}

function getRemoteOptionsPanelStyle (isController) {
  if (isController) {
    return {
      width: '100vw',
      height: '100dvh',
      'max-height': '100vh',
      overflow: 'hidden',
      padding: '0',
      background: '#000',
      border: '0',
      'border-radius': '0',
      'box-shadow': 'none',
      'box-sizing': 'border-box',
      '-webkit-overflow-scrolling': 'touch',
      'overscroll-behavior': 'contain',
      'touch-action': 'manipulation'
    }
  }

  const style = {
    width: 'min(620px, calc(100vw - 32px))',
    'max-height': 'calc(100vh - 32px)',
    overflow: 'auto',
    padding: '24px',
    background: '#111',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    'border-radius': '16px',
    'box-shadow': '0 16px 60px rgba(0, 0, 0, 0.55)',
    'box-sizing': 'border-box',
    '-webkit-overflow-scrolling': 'touch',
    'overscroll-behavior': 'contain',
    'touch-action': 'pan-y'
  }

  return style
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
  const children = [
    controllerTopBarView(PS, state),
    controllerPreviewsView(PS, state),
    h('div.ps-controller-controls', {
      style: getControllerControlsStyle()
    }, [
      h('button', { type: 'button', onclick: sendRemoteCommand(state, 'prev'), style: controllerButtonStyle() }, 'Prev'),
      h('button', { type: 'button', onclick: sendRemoteCommand(state, 'next'), style: controllerButtonStyle() }, 'Next')
    ])
  ]
  const notes = controllerNotesView(state)
  if (notes) children.push(notes)

  return h('div.ps-controller-view', {
    style: getControllerViewStyle()
  }, children)
}

function getControllerViewStyle () {
  return {
    display: 'grid',
    'grid-template-rows': 'auto minmax(0, 1fr) minmax(0, 1fr) auto',
    gap: '10px',
    height: '100%',
    'min-height': 0,
    overflow: 'hidden',
    position: 'relative',
    background: '#000',
    'touch-action': 'manipulation'
  }
}

function getControllerControlsStyle () {
  return {
    display: 'grid',
    'grid-template-columns': '1fr 1fr',
    gap: '12px',
    'grid-row': '4',
    'z-index': 2
  }
}

function controllerNotesView (state) {
  const lines = getControllerNotesLines(state && state.notes)
  if (!lines.length) return null

  return h('section.ps-controller-notes-card', {
    'aria-label': 'Current slide notes',
    style: getControllerNotesCardStyle()
  }, [
    h('div.ps-controller-notes-body', {
      style: getControllerNotesBodyStyle()
    }, lines.map(function (line, index) {
      return h('p', {
        style: {
          margin: index === lines.length - 1 ? 0 : '0 0 0.55em'
        }
      }, line)
    }))
  ])
}

function getControllerNotesLines (notes) {
  const list = Array.isArray(notes) ? notes : (notes == null ? [] : [notes])

  return list.map(function (note) {
    return note == null ? '' : String(note)
  }).filter(function (note) {
    return note.trim().length > 0
  })
}

function hasControllerNotes (notes) {
  return getControllerNotesLines(notes).length > 0
}

function getControllerNotesCardStyle () {
  return {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    'z-index': 3,
    display: 'grid',
    gap: '8px',
    'max-height': CONTROLLER_NOTES_MAX_HEIGHT,
    overflow: 'hidden',
    padding: '10px 12px',
    background: '#050505',
    border: '1px solid rgba(139, 211, 255, 0.28)',
    'border-radius': '12px',
    'box-sizing': 'border-box',
    'box-shadow': '0 10px 28px rgba(0, 0, 0, 0.34)'
  }
}

function getControllerNotesBodyStyle () {
  return {
    'max-height': CONTROLLER_NOTES_MAX_HEIGHT,
    overflow: 'auto',
    '-webkit-overflow-scrolling': 'touch',
    'overscroll-behavior': 'contain',
    'font-size': '15px',
    'line-height': 1.4,
    color: '#f4f8fb',
    'white-space': 'pre-wrap'
  }
}

function controllerTopBarView (PS, state) {
  return h('div.ps-controller-top-bar', {
    style: {
      display: 'grid',
      'grid-template-columns': '1fr auto 1fr',
      'align-items': 'center',
      gap: '6px',
      padding: '0 10px',
      background: 'transparent',
      border: '0',
      'border-radius': '0',
      'font-size': '12px',
      'line-height': 1.2,
      'grid-row': '1',
      'z-index': 2
    }
  }, [
    h('div.ps-controller-top-left', {
      style: {
        display: 'flex',
        'justify-content': 'flex-start',
        'align-items': 'center',
        'min-width': 0
      }
    }, controllerSlideTimerView(state)),
    h('div.ps-controller-top-center', {
      style: {
        display: 'flex',
        'justify-content': 'center',
        'align-items': 'center',
        gap: '4px',
        'justify-self': 'center',
        'min-width': 0,
        'white-space': 'nowrap'
      }
    }, [
      controllerStatusDotView(state),
      h('strong.ps-controller-slide-position', {
        'aria-label': 'slide ' + getControllerSlidePositionText(state),
        style: {
          color: '#fff',
          'font-size': '14px',
          'font-variant-numeric': 'tabular-nums',
          'text-transform': 'none'
        }
      }, getControllerSlidePositionText(state))
    ]),
    h('div.ps-controller-top-right', {
      style: {
        display: 'flex',
        'justify-content': 'flex-end',
        'align-items': 'center',
        'min-width': 0
      }
    }, controllerTalkTimerView(PS, state))
  ])
}

function getControllerSlidePositionText (state) {
  const count = Math.max(0, parseInt(state && state.slideCount, 10) || 0)
  const current = count ? clampSlideNumber(state && state.slideNumber, count) : 0
  return current + '/' + count
}

function controllerTalkTimerView (PS, state) {
  const running = state && state.timerStartedAt != null

  return h('div.ps-controller-presentation-timer', {
    style: controllerTimerPillStyle()
  }, running
    ? [
        h('span', {
          style: controllerTimerLabelStyle()
        }, 'talk '),
        h('strong.ps-controller-timer-display', {
          style: controllerTimerDisplayStyle()
        }, formatControllerTalkTimerDisplay(state))
      ]
    : h('button', {
      type: 'button',
      onclick: startControllerTimer(PS, state),
      style: compactTimerButtonStyle()
    }, 'start timer'))
}

function controllerSlideTimerView (state) {
  return h('div.ps-controller-current-slide-timer', {
    'aria-label': 'Current slide duration',
    title: 'Current slide duration',
    style: controllerTimerPillStyle()
  }, [
    h('span', {
      style: controllerTimerLabelStyle()
    }, 'slide '),
    h('strong.ps-controller-slide-timer-display', {
      style: controllerTimerDisplayStyle()
    }, formatControllerSlideTimer(getControllerSlideTimerSeconds(state)))
  ])
}

function controllerTimerPillStyle () {
  return {
    display: 'flex',
    'align-items': 'baseline',
    gap: '3px',
    padding: '0',
    background: 'transparent',
    border: '0',
    'border-radius': '0',
    'white-space': 'nowrap'
  }
}

function controllerStatusDotView (state) {
  const status = state && state.status ? String(state.status) : 'Remote status unknown'

  return h('span.ps-controller-status-dot', {
    title: status,
    'aria-label': 'Status: ' + status,
    role: 'img',
    style: {
      display: 'inline-block',
      width: '9px',
      height: '9px',
      flex: '0 0 auto',
      background: getControllerStatusColor(status),
      'border-radius': '999px'
    }
  })
}

function getControllerStatusColor (status) {
  const tone = getControllerStatusTone(status)
  if (tone === 'green') return '#37d67a'
  if (tone === 'yellow') return '#ffd43b'
  return '#ff5c5c'
}

function getControllerStatusTone (status) {
  const text = String(status || '').toLowerCase()

  if (/\bconnected\b/.test(text)) return 'green'
  if (/\b(connecting|reconnecting|ready|waiting|starting|creating|retrying|busy)\b/.test(text)) return 'yellow'
  if (/\b(locked|disconnected|unavailable|disabled|error|failed|denied|closed|lost|off|taken|rejected)\b/.test(text)) return 'red'
  return 'red'
}

function controllerTimerLabelStyle () {
  return {
    color: '#bbb',
    'font-size': '10px',
    'font-weight': 700,
    'letter-spacing': '0.06em',
    'text-transform': 'none'
  }
}

function controllerTimerDisplayStyle () {
  return {
    'font-variant-numeric': 'tabular-nums',
    'font-size': '14px'
  }
}

function compactTimerButtonStyle () {
  return {
    color: '#111',
    background: '#8bd3ff',
    border: '1px solid rgba(255, 255, 255, 0.35)',
    'border-radius': '999px',
    padding: '3px 8px',
    'min-height': '24px',
    'font-size': '11px',
    'font-weight': 700,
    cursor: 'pointer'
  }
}

function controllerPreviewsView (PS, state) {
  const numbers = getPreviewSlideNumbers(state.slideNumber, state.slideCount)

  return h('div.ps-controller-previews', {
    style: getControllerPreviewsStyle()
  }, [
    slidePreviewCard(PS, numbers.current, numbers.slideCount, 'current'),
    slidePreviewCard(PS, numbers.next, numbers.slideCount, 'next')
  ])
}

function getControllerPreviewsStyle () {
  return {
    display: 'grid',
    'grid-template-rows': 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: '10px',
    'grid-row': '2 / 4',
    'min-height': 0,
    overflow: 'hidden',
    margin: '0'
  }
}

function slidePreviewCard (PS, slideNumber, slideCount, variant) {
  const isNext = variant === 'next'
  const label = isNext ? 'next' : 'current'
  const body = h('div.ps-controller-preview-body', { style: getPreviewViewportStyle() })
  const frame = createPreviewFrame()
  body.appendChild(frame)
  if (isNext) body.appendChild(controllerNextPreviewBadge())

  renderSlidePreviewFrame(PS && PS.slides, slideNumber, frame, {
    emptyText: isNext ? 'No next slide' : 'No current slide'
  })
  fitPreviewStage(body, frame)

  return h('section.ps-controller-preview-card.ps-controller-preview-card-' + label, {
    'aria-label': label + (slideNumber ? (' slide ' + slideNumber + ' of ' + slideCount) : ''),
    style: getControllerPreviewCardStyle(variant)
  }, body)
}

function getControllerPreviewCardStyle (variant) {
  return {
    display: 'grid',
    gap: '6px',
    width: '100%',
    height: '100%',
    'min-height': 0,
    overflow: 'hidden',
    'align-self': variant === 'next' ? 'end' : 'start',
    'grid-row': variant === 'next' ? '2' : '1'
  }
}

function controllerNextPreviewBadge () {
  return h('span.ps-controller-next-preview-badge', {
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      'z-index': 1,
      padding: '2px 6px',
      color: '#fff',
      background: 'rgba(0, 0, 0, 0.7)',
      'border-radius': '999px',
      'font-size': '10px',
      'font-weight': 700,
      'letter-spacing': '0.04em',
      'line-height': 1.2,
      'text-transform': 'lowercase',
      'pointer-events': 'none'
    }
  }, 'next')
}

function createPreviewFrame () {
  const frame = h('iframe.ps-controller-preview-frame', {
    title: 'Slide preview',
    tabindex: '-1',
    sandbox: 'allow-same-origin',
    srcdoc: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"></head><body></body></html>',
    style: getPreviewStageStyle()
  })

  frame.setAttribute('aria-hidden', 'true')
  return frame
}

function renderSlidePreviewFrame (slides, slideNumber, frame, opts) {
  opts = opts || {}

  function render () {
    const doc = frame.contentDocument || (frame.contentWindow && frame.contentWindow.document)
    if (!doc || !doc.body) return renderSlidePreview(slides, slideNumber, frameFallbackTarget(frame), opts)

    doc.documentElement.style.cssText = 'width:100%;height:100%;margin:0;overflow:hidden;background:#000;'
    doc.body.style.cssText = 'width:100%;height:100%;margin:0;overflow:hidden;background:#000;'
    renderSlidePreview(slides, slideNumber, doc.body, opts)
  }

  if (frame.contentDocument && frame.contentDocument.body) render()
  frame.onload = render
}

function frameFallbackTarget (frame) {
  if (!frame._psFallbackTarget) {
    frame._psFallbackTarget = h('div', {
      style: {
        width: '100%',
        height: '100%',
        background: '#000'
      }
    })
  }
  return frame._psFallbackTarget
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

function getPreviewViewportStyle () {
  return {
    width: '100%',
    height: '100%',
    'min-height': 0,
    'aspect-ratio': PREVIEW_ASPECT_RATIO,
    overflow: 'hidden',
    position: 'relative',
    background: '#000',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    'border-radius': '12px',
    'box-sizing': 'border-box',
    'touch-action': 'none',
    '-webkit-user-select': 'none',
    'user-select': 'none'
  }
}

function getPreviewStageStyle (scale) {
  return {
    width: PREVIEW_BASE_WIDTH + 'px',
    height: PREVIEW_BASE_HEIGHT + 'px',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: getPreviewStageTransform(scale == null ? 0.25 : scale),
    'transform-origin': 'center center',
    overflow: 'visible',
    display: 'flex',
    'justify-content': 'center',
    'align-items': 'center',
    background: '#000',
    border: 0,
    'pointer-events': 'none',
    'touch-action': 'none'
  }
}

function getPreviewStageTransform (scale) {
  const parsed = parseFloat(scale)
  const safeScale = isFinite(parsed) && parsed > 0 ? parsed : 0.25
  return 'translate(-50%, -50%) scale(' + safeScale + ')'
}

function getPreviewStageScale (viewportWidth, viewportHeight) {
  const width = parseFloat(viewportWidth)
  const height = parseFloat(viewportHeight)

  if (!isFinite(width) || width <= 0 || !isFinite(height) || height <= 0) return 0.25

  return Math.max(width / PREVIEW_BASE_WIDTH, height / PREVIEW_BASE_HEIGHT)
}

function fitPreviewStage (viewport, stage) {
  if (!viewport || !stage || !stage.style) return

  function update () {
    stage.style.setProperty('transform', getPreviewStageTransform(getPreviewStageScale(viewport.clientWidth, viewport.clientHeight)))
  }

  update()

  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(update)

  if (typeof ResizeObserver === 'function') {
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    return
  }

  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('resize', update)
}

function startControllerTimer (PS, state) {
  return function () {
    if (state.timerStartedAt != null) return

    const now = getControllerNow(state)
    state.timerStartedAt = now
    state.timerNow = now
    state.slideTimerStartedAt = now
    state.slideTimerNow = now
    state.completedSlideDurations = []

    ensureControllerTimerInterval(PS, state)
    updateRemoteOptions(PS, state)
  }
}

function ensureControllerTimerInterval (PS, state) {
  if (!PS || !state || state.timerInterval) return
  if (state.timerStartedAt == null && state.slideTimerStartedAt == null) return

  const setIntervalFn = state.opts && state.opts.setInterval ? state.opts.setInterval : setInterval

  state.timerInterval = setIntervalFn(function () {
    const now = getControllerNow(state)
    if (state.timerStartedAt != null) state.timerNow = now
    if (state.slideTimerStartedAt != null) state.slideTimerNow = now
    updateControllerTimerDisplays(state)
  }, 1000)

  if (state.timerInterval && typeof state.timerInterval.unref === 'function') state.timerInterval.unref()
}

function updateControllerNotesLayer (state) {
  if (!state || !state.overlay || typeof state.overlay.querySelector !== 'function') return false

  const root = state.overlay.querySelector('.ps-controller-view')
  if (!root) return false

  const existing = root.querySelector('.ps-controller-notes-card')
  const next = controllerNotesView(state)

  if (existing && typeof root.removeChild === 'function') root.removeChild(existing)
  if (next && typeof root.appendChild === 'function') root.appendChild(next)

  return true
}

function updateControllerTimerDisplays (state) {
  if (!state || !state.overlay || typeof state.overlay.querySelector !== 'function') return false

  const slideTimerLabel = state.overlay.querySelector('.ps-controller-current-slide-timer')
  const slideTimer = slideTimerLabel && typeof slideTimerLabel.querySelector === 'function'
    ? slideTimerLabel.querySelector('.ps-controller-slide-timer-display')
    : state.overlay.querySelector('.ps-controller-slide-timer-display')
  const presentationTimer = state.overlay.querySelector('.ps-controller-timer-display')
  let updated = false

  if (slideTimer) {
    slideTimer.textContent = formatControllerSlideTimer(getControllerSlideTimerSeconds(state))
    updated = true
  }

  if (presentationTimer) {
    presentationTimer.textContent = formatControllerTalkTimerDisplay(state)
    updated = true
  }

  return updated
}

function getControllerTimerSeconds (state, now) {
  if (!state || state.timerStartedAt == null) return 0

  return getElapsedTimerSeconds(state.timerStartedAt, now == null ? state.timerNow : now, state)
}

function getControllerSlideTimerSeconds (state, now) {
  if (!state || state.slideTimerStartedAt == null) return 0

  return getElapsedTimerSeconds(state.slideTimerStartedAt, now == null ? state.slideTimerNow : now, state)
}

function getEstimatedControllerTalkDurationSeconds (state, now) {
  if (!state || state.timerStartedAt == null) return null

  const elapsedSeconds = getControllerTimerSeconds(state, now)
  const slideCount = Math.max(0, parseInt(state.slideCount, 10) || 0)
  if (!slideCount) return elapsedSeconds

  const slideNumber = clampSlideNumber(state.slideNumber, slideCount)
  const paceSeconds = getEstimatedControllerSlidePaceSeconds(state.completedSlideDurations)
  const currentSlideElapsedSeconds = getControllerSlideTimerSeconds(state, now)
  const currentSlideRemainingSeconds = Math.max(0, paceSeconds - currentSlideElapsedSeconds)
  const futureSlideCount = Math.max(0, slideCount - slideNumber)

  return elapsedSeconds + currentSlideRemainingSeconds + (futureSlideCount * paceSeconds)
}

function getEstimatedControllerSlidePaceSeconds (completedSlideDurations) {
  const durations = normalizeCompletedSlideDurations(completedSlideDurations)
  const robustCompletedPace = getRobustCompletedSlideDurationSeconds(durations)
  if (!robustCompletedPace) return DEFAULT_CONTROLLER_SLIDE_DURATION_SECONDS

  const priorWeight = Math.max(0, 3 - durations.length)
  if (!priorWeight) return robustCompletedPace

  return Math.round(((robustCompletedPace * durations.length) + (DEFAULT_CONTROLLER_SLIDE_DURATION_SECONDS * priorWeight)) / (durations.length + priorWeight))
}

function getRobustCompletedSlideDurationSeconds (completedSlideDurations) {
  const durations = normalizeCompletedSlideDurations(completedSlideDurations).sort(function (a, b) { return a - b })
  if (!durations.length) return 0

  const trimmedDurations = durations.length >= 5 ? durations.slice(1, -1) : durations
  const middle = Math.floor(trimmedDurations.length / 2)

  if (trimmedDurations.length % 2) return trimmedDurations[middle]
  return Math.round((trimmedDurations[middle - 1] + trimmedDurations[middle]) / 2)
}

function normalizeCompletedSlideDurations (completedSlideDurations) {
  if (!Array.isArray(completedSlideDurations)) return []

  return completedSlideDurations.map(function (duration) {
    if (duration && typeof duration === 'object') return parseInt(duration.durationSeconds, 10)
    return parseInt(duration, 10)
  }).filter(function (duration) {
    return duration > 0
  })
}

function getElapsedTimerSeconds (startedAt, current, state) {
  const resolvedCurrent = current == null ? getControllerNow(state) : current
  const elapsed = Math.floor((resolvedCurrent - startedAt) / 1000)
  return elapsed > 0 ? elapsed : 0
}

function getControllerNow (state) {
  if (state && state.opts && typeof state.opts.now === 'function') return state.opts.now()
  return Date.now()
}

function formatControllerTimer (seconds) {
  const safeSeconds = Math.max(0, parseInt(seconds, 10) || 0)
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60

  return padTimerPart(minutes) + ':' + padTimerPart(remainder)
}

function formatControllerSlideTimer (seconds) {
  const safeSeconds = Math.max(0, parseInt(seconds, 10) || 0)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainder = safeSeconds % 60

  if (hours > 0) return hours + 'h ' + minutes + 'm ' + remainder + 's'
  if (minutes > 0) return minutes + 'm ' + remainder + 's'
  return remainder + 's'
}

function formatControllerTalkTimer (seconds) {
  const safeSeconds = Math.max(0, parseInt(seconds, 10) || 0)
  const totalMinutes = Math.floor(safeSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0 && minutes > 0) return hours + 'h ' + minutes + 'm'
  if (hours > 0) return hours + 'h'
  return minutes + 'm'
}

function formatControllerTalkTimerDisplay (state) {
  const elapsedText = formatControllerTalkTimer(getControllerTimerSeconds(state))
  const estimateSeconds = getEstimatedControllerTalkDurationSeconds(state)

  if (estimateSeconds == null) return elapsedText
  return elapsedText + ' / ' + formatControllerTalkEstimate(estimateSeconds)
}

function formatControllerTalkEstimate (seconds) {
  const safeSeconds = Math.max(0, parseInt(seconds, 10) || 0)
  const roundedSeconds = Math.round(safeSeconds / 60) * 60
  return '~' + formatControllerTalkTimer(roundedSeconds)
}

function padTimerPart (value) {
  return value < 10 ? '0' + value : String(value)
}

function sendRemoteCommand (state, command) {
  return function () {
    if (!state.deckConnection || !state.deckConnection.open) return
    state.deckConnection.send({ type: 'command', command })
  }
}

function controllerButtonStyle () {
  return Object.assign({}, remoteButtonStyle(), {
    width: '100%',
    padding: '16px 14px',
    'font-size': '18px',
    'font-weight': 700
  })
}
function remoteButtonStyle () {
  return {
    padding: '10px 14px',
    border: '1px solid rgba(255, 255, 255, 0.35)',
    'border-radius': '10px',
    background: 'rgba(255, 255, 255, 0.12)',
    color: 'white',
    cursor: 'pointer',
    'touch-action': 'manipulation',
    '-webkit-user-select': 'none',
    'user-select': 'none'
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

function getDeckPeerIdStorageKey (opts) {
  opts = opts || {}
  if (opts.deckPeerIdStorageKey) return opts.deckPeerIdStorageKey

  return [
    DECK_PEER_ID_STORAGE_PREFIX,
    stableDeckIdentity(opts)
  ].join(':')
}

function getDeckRemoteEnabledStorageKey (opts) {
  opts = opts || {}
  if (opts.deckRemoteEnabledStorageKey) return opts.deckRemoteEnabledStorageKey

  return [
    DECK_REMOTE_ENABLED_STORAGE_PREFIX,
    stableDeckIdentity(opts)
  ].join(':')
}

function isDeckRemoteEnabled (opts) {
  opts = opts || {}
  const storage = opts.sessionStorage || getBrowserStorage('sessionStorage')
  return storageGet(storage, getDeckRemoteEnabledStorageKey(opts)) === '1'
}

function storeDeckRemoteEnabled (state) {
  state = state || {}
  const opts = state.opts || {}
  const storage = opts.sessionStorage || getBrowserStorage('sessionStorage')
  storageSet(storage, getDeckRemoteEnabledStorageKey(opts), '1')
}

function getDeckPeerId (state) {
  state = state || {}
  const opts = state.opts || {}
  if (opts.peerId) return opts.peerId

  const storage = opts.sessionStorage || getBrowserStorage('sessionStorage')
  const key = getDeckPeerIdStorageKey(opts)
  const existing = storageGet(storage, key)
  if (existing) return existing

  const peerId = generateId('deck')
  storageSet(storage, key, peerId)
  return peerId
}

function storeDeckPeerId (state, peerId) {
  if (!peerId) return

  state = state || {}
  const opts = state.opts || {}
  if (opts.peerId) return

  const storage = opts.sessionStorage || getBrowserStorage('sessionStorage')
  storageSet(storage, getDeckPeerIdStorageKey(opts), peerId)
}

function clearStoredDeckPeerId (state) {
  state = state || {}
  const opts = state.opts || {}
  if (opts.peerId) return false

  const storage = opts.sessionStorage || getBrowserStorage('sessionStorage')
  storageRemove(storage, getDeckPeerIdStorageKey(opts))
  return true
}

function recoverDeckPeerId (PS, state, err, Peer) {
  state = state || {}
  const opts = state.opts || {}
  if (opts.peerId || !isDeckPeerIdCollisionError(err)) return false

  Peer = Peer || loadPeer(opts)
  if (!Peer) return false

  const oldPeer = state.peer
  clearStoredDeckPeerId(state)
  state.peerId = null
  state.remoteUrl = null
  state.status = 'Remote peer ID busy. Retrying...'

  if (oldPeer && typeof oldPeer.destroy === 'function') {
    try { oldPeer.destroy() } catch (err) {}
  } else if (oldPeer && typeof oldPeer.disconnect === 'function') {
    try { oldPeer.disconnect() } catch (err) {}
  }

  openDeckPeer(PS, state, Peer)
  updateRemoteOptions(PS, state)
  return true
}

function isDeckPeerIdCollisionError (err) {
  const type = String((err && err.type) || (err && err.name) || '').toLowerCase()
  const message = String((err && err.message) || err || '').toLowerCase()

  if (type === 'unavailable-id' || type === 'id-taken' || type === 'id-unavailable') return true
  if (/\bid\b.*\b(taken|unavailable|in use|already exists)\b/.test(message)) return true
  if (/\b(taken|unavailable|in use)\b.*\bid\b/.test(message)) return true
  return false
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

function storageRemove (storage, key) {
  try {
    if (!storage) return
    if (typeof storage.removeItem === 'function') {
      storage.removeItem(key)
      return
    }
    if (typeof storage.setItem === 'function') storage.setItem(key, '')
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
