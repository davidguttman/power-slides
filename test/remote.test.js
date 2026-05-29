const test = require('node:test')
const assert = require('node:assert/strict')
const createRemote = require('../remote')
const remote = createRemote._test
const packageJson = require('../package.json')

test('builds a remote URL with peer id and pair key query params', function () {
  assert.equal(
    remote.getRemoteUrl('deck-123', {}, 'https://talk.example/deck?foo=1#/3', '#/3', 'pair-abc'),
    'https://talk.example/deck?foo=1&ps-remote=deck-123&ps-pair=pair-abc#/3'
  )

  assert.equal(
    remote.getRemoteUrl('deck-456', {}, 'https://talk.example/deck?ps-remote=old&ps-pair=old&foo=1', '', 'pair-new'),
    'https://talk.example/deck?foo=1&ps-remote=deck-456&ps-pair=pair-new'
  )
})

test('reads remote IDs and pair keys from configurable query params', function () {
  assert.equal(remote.getQueryParamFromSearch('ps-remote', '?ps-remote=deck-123'), 'deck-123')
  assert.equal(remote.getQueryParamFromSearch('remote', '?foo=1&remote=deck-456'), 'deck-456')
  assert.equal(remote.getQueryParamFromSearch('ps-pair', '?ps-remote=deck-123&ps-pair=pair-abc'), 'pair-abc')
  assert.equal(remote.getQueryParamFromSearch('remote', '?foo=1'), '')
})

test('malformed remote query params do not throw during startup parsing', function () {
  assert.doesNotThrow(function () {
    assert.equal(remote.getQueryParamFromSearch('ps-remote', '?ps-remote=%'), '%')
  })

  assert.doesNotThrow(function () {
    assert.equal(remote.getQueryParamFromSearch('ps-pair', '?ps-pair=%'), '%')
  })

  assert.doesNotThrow(function () {
    remote.getRemoteUrl('deck-new', {}, 'https://talk.example/deck?ps-remote=%&ps-pair=%25&foo=1', '', 'pair-new')
  })
})

test('first controller hello stores the winning controller id', function () {
  const storage = memoryStorage()
  const state = deckState(storage)
  const conn = fakeConnection()

  assert.equal(remote.acceptDeckHello(state, conn, remote.buildHelloMessage('pair-1', 'client-a')), true)
  assert.equal(state.controllerId, 'client-a')
  assert.equal(storage.getItem(remote.getControllerStorageKey(state.opts)), 'client-a')
  assert.equal(state.activeConnection, conn)
  assert.deepEqual(conn.sent, [])
})

test('accepted controller hello closes open deck options', function () {
  const storage = memoryStorage()
  const state = deckState(storage)
  const conn = fakeConnection()
  const overlay = { name: 'options' }
  let closeCount = 0

  state.overlay = overlay
  state.closeOptions = function () {
    closeCount += 1
    state.overlay = null
  }

  assert.equal(remote.acceptDeckHello(state, conn, remote.buildHelloMessage('pair-1', 'client-a')), true)
  assert.equal(closeCount, 1)
  assert.equal(state.overlay, null)
})

test('rejected controller hello leaves open deck options visible', function () {
  const storage = memoryStorage()
  const state = deckState(storage)
  const conn = fakeConnection()
  const overlay = { name: 'options' }
  let closeCount = 0

  state.overlay = overlay
  state.closeOptions = function () {
    closeCount += 1
    state.overlay = null
  }

  assert.equal(remote.acceptDeckHello(state, conn, remote.buildHelloMessage('wrong-pair', 'client-a')), false)
  assert.equal(closeCount, 0)
  assert.equal(state.overlay, overlay)
})

test('locked controller hello leaves open deck options visible', function () {
  const storage = memoryStorage()
  const state = deckState(storage)
  const first = fakeConnection()
  const intruder = fakeConnection()
  const overlay = { name: 'options' }
  let closeCount = 0

  assert.equal(remote.acceptDeckHello(state, first, remote.buildHelloMessage('pair-1', 'client-a')), true)

  state.overlay = overlay
  state.closeOptions = function () {
    closeCount += 1
    state.overlay = null
  }

  assert.equal(remote.acceptDeckHello(state, intruder, remote.buildHelloMessage('pair-1', 'client-b')), false)
  assert.equal(closeCount, 0)
  assert.equal(state.overlay, overlay)
})

test('controller lock key is stable for the same deck URL across random peer IDs', function () {
  const opts = { location: 'https://talk.example/deck?foo=1#/3' }
  const reloadedOpts = { location: 'https://talk.example/deck?bar=2#/9' }

  assert.equal(
    remote.getControllerStorageKey(opts, 'random-peer-a'),
    remote.getControllerStorageKey(reloadedOpts, 'random-peer-b')
  )
  assert.equal(remote.getControllerStorageKey(opts), 'power-slides.remote.controllerId:https://talk.example/deck')
})

test('controller lock key can be overridden by the app shell', function () {
  assert.equal(
    remote.getControllerStorageKey({ controllerStorageKey: 'talk:custom-lock' }, 'random-peer-a'),
    'talk:custom-lock'
  )
})

test('deck peer id persists across host reloads for the same deck URL', function () {
  const storage = memoryStorage()
  const first = { opts: { sessionStorage: storage, location: 'https://talk.example/deck?foo=1#/3' } }
  const reloaded = { opts: { sessionStorage: storage, location: 'https://talk.example/deck?bar=2#/9' } }

  const peerId = remote.getDeckPeerId(first)

  assert.match(peerId, /^deck-/)
  assert.equal(remote.getDeckPeerId(reloaded), peerId)
  assert.equal(storage.getItem(remote.getDeckPeerIdStorageKey(first.opts)), peerId)
})

test('enableRemote stores deck remote enabled state for the stable deck URL', function () {
  const storage = memoryStorage()
  const peers = []
  const opts = {
    sessionStorage: storage,
    location: 'https://talk.example/deck?foo=1#/3',
    Peer: fakePeerClass(peers)
  }

  withFakeBrowser('https://talk.example/deck?foo=1#/3', function () {
    const state = createRemote(fakePS(), opts)

    assert.equal(remote.isDeckRemoteEnabled(opts), false)
    state.enableRemote()

    assert.equal(remote.isDeckRemoteEnabled(opts), true)
    assert.equal(storage.getItem(remote.getDeckRemoteEnabledStorageKey(opts)), '1')
    assert.equal(remote.isDeckRemoteEnabled({
      sessionStorage: storage,
      location: 'https://talk.example/deck?bar=2#/9'
    }), true)
    assert.equal(peers.length, 1)
  })
})

test('reloaded deck with stored enabled flag automatically restarts remote hosting', function () {
  const storage = memoryStorage()
  const first = { opts: { sessionStorage: storage, location: 'https://talk.example/deck?foo=1#/3' } }
  const reloadedOpts = { sessionStorage: storage, location: 'https://talk.example/deck?bar=2#/9' }
  const peerId = remote.getDeckPeerId(first)
  const peers = []

  remote.storeDeckRemoteEnabled(first)
  storage.setItem(remote.getControllerStorageKey(first.opts), 'client-a')

  withFakeBrowser('https://talk.example/deck?bar=2#/9', function () {
    const state = createRemote(fakePS(), Object.assign({}, reloadedOpts, { Peer: fakePeerClass(peers) }))

    assert.equal(state.role, 'deck')
    assert.equal(state.remoteEnabled, true)
    assert.equal(peers.length, 1)
    assert.equal(peers[0].id, peerId)

    peers[0].emit('open', peerId)

    assert.equal(state.peerId, peerId)
    assert.equal(state.controllerId, 'client-a')
    assert.match(state.remoteUrl, /[?&]ps-remote=/)
    assert.match(state.remoteUrl, /[?&]ps-pair=/)
  })
})

test('deck without stored enabled flag does not auto-start remote hosting', function () {
  const storage = memoryStorage()
  const peers = []

  withFakeBrowser('https://talk.example/deck', function () {
    const state = createRemote(fakePS(), {
      sessionStorage: storage,
      location: 'https://talk.example/deck',
      Peer: fakePeerClass(peers)
    })

    assert.equal(state.role, 'deck')
    assert.equal(state.remoteEnabled, false)
    assert.equal(peers.length, 0)
  })
})

test('locked deck ignores pair key and only accepts the stored client id', function () {
  const storage = memoryStorage()
  const state = deckState(storage)
  const first = fakeConnection()
  const sameClient = fakeConnection()
  const intruder = fakeConnection()

  assert.equal(remote.acceptDeckHello(state, first, remote.buildHelloMessage('pair-1', 'client-a')), true)
  assert.equal(remote.acceptDeckHello(state, sameClient, remote.buildHelloMessage('wrong-pair', 'client-a')), true)

  assert.equal(first.closed, true)
  assert.equal(state.activeConnection, sameClient)
  assert.deepEqual(state.connections, [sameClient])

  assert.equal(remote.acceptDeckHello(state, intruder, remote.buildHelloMessage('pair-1', 'client-b')), false)
  assert.deepEqual(intruder.sent, [{ type: 'locked' }])
  assert.equal(intruder.closed, true)
  assert.equal(state.activeConnection, sameClient)
})

test('reloaded deck keeps peer id and accepts stored controller despite changed pair key', function () {
  const storage = memoryStorage()
  const firstState = deckState(storage)
  const first = fakeConnection()

  firstState.opts.location = 'https://talk.example/deck?foo=1#/3'
  const peerId = remote.getDeckPeerId(firstState)

  assert.equal(remote.acceptDeckHello(firstState, first, remote.buildHelloMessage('pair-1', 'client-a')), true)

  const reloadedState = deckState(storage)
  const sameClient = fakeConnection()
  const intruder = fakeConnection()

  reloadedState.opts.location = 'https://talk.example/deck?bar=2#/9'
  reloadedState.pairKey = 'pair-2'

  assert.equal(remote.getDeckPeerId(reloadedState), peerId)
  assert.equal(remote.acceptDeckHello(reloadedState, sameClient, remote.buildHelloMessage('old-pair', 'client-a')), true)
  assert.equal(reloadedState.activeConnection, sameClient)

  assert.equal(remote.acceptDeckHello(reloadedState, intruder, remote.buildHelloMessage('pair-2', 'client-b')), false)
  assert.deepEqual(intruder.sent, [{ type: 'locked' }])
})

test('same client reconnect replaces the previous active connection', function () {
  const storage = memoryStorage()
  const state = deckState(storage)
  const first = fakeConnection()
  const second = fakeConnection()

  assert.equal(remote.acceptDeckHello(state, first, remote.buildHelloMessage('pair-1', 'client-a')), true)
  assert.equal(remote.acceptDeckHello(state, second, remote.buildHelloMessage('pair-1', 'client-a')), true)

  assert.equal(first.closed, true)
  assert.equal(second.closed, false)
  assert.equal(state.activeConnection, second)
  assert.deepEqual(state.connections, [second])
})

test('locked controller status survives the close event', function () {
  const state = { status: 'Connected to deck', deckLocked: false }

  assert.equal(remote.handleControllerData(state, { type: 'locked' }), true)
  assert.equal(state.status, 'Deck locked to another controller')

  remote.handleControllerClose(state)
  assert.equal(state.status, 'Deck locked to another controller')
})

test('controller schedules reconnect after deck connection closes', function () {
  let scheduled = null
  const connections = []
  const state = {
    opts: {
      reconnectMs: 5,
      setTimeout: function (callback, delay) {
        scheduled = { callback, delay }
        return 'timer-1'
      },
      clearTimeout: function () {}
    },
    peer: {
      connect: function (id, opts) {
        const conn = fakeEventConnection(id, opts)
        connections.push(conn)
        return conn
      }
    },
    deckId: 'deck-1',
    clientId: 'client-a',
    pairKey: 'pair-1',
    status: '',
    deckLocked: false,
    reconnectTimer: null,
    reconnectAttempts: 0
  }

  const first = remote.connectControllerDeck(null, state)
  first.emit('open')

  assert.deepEqual(first.sent, [remote.buildHelloMessage('pair-1', 'client-a')])

  first.emit('close')

  assert.equal(state.status, 'Reconnecting to deck...')
  assert.equal(state.reconnectAttempts, 1)
  assert.equal(scheduled.delay, 5)

  scheduled.callback()

  assert.equal(connections.length, 2)
  assert.equal(state.deckConnection, connections[1])

  connections[1].emit('open')

  assert.equal(state.status, 'Connected to deck')
  assert.equal(state.reconnectAttempts, 0)
  assert.deepEqual(connections[1].sent, [remote.buildHelloMessage('pair-1', 'client-a')])
})

test('controller clears pending reconnect when current connection opens', function () {
  const timers = []
  const connections = []
  const state = controllerReconnectState({
    opts: {
      reconnectMs: 5,
      setTimeout: function (callback, delay) {
        const timer = { callback, delay, active: true }
        timers.push(timer)
        return timer
      },
      clearTimeout: function (timer) {
        timer.active = false
      }
    },
    connections
  })

  const first = remote.connectControllerDeck(null, state)

  assert.equal(remote.scheduleControllerReconnect(null, state), true)
  assert.equal(timers.length, 1)
  assert.equal(timers[0].active, true)
  assert.equal(state.reconnectTimer, timers[0])

  first.emit('open')

  assert.equal(timers[0].active, false)
  assert.equal(state.reconnectTimer, null)
  assert.equal(connections.length, 1)

  if (timers[0].active) timers[0].callback()

  assert.equal(connections.length, 1)
})

test('stale controller connection data cannot mutate current state', function () {
  const connections = []
  const state = controllerReconnectState({ connections })

  const stale = remote.connectControllerDeck(null, state)
  const current = remote.connectControllerDeck(null, state)

  assert.equal(state.deckConnection, current)

  stale.emit('data', { type: 'locked' })
  stale.emit('data', { type: 'state', slideNumber: 9, slideCount: 10, notes: ['stale'] })

  assert.equal(state.deckLocked, false)
  assert.equal(state.slideNumber, 1)
  assert.equal(state.slideCount, 3)
  assert.deepEqual(state.notes, [])

  current.emit('data', { type: 'state', slideNumber: 2, slideCount: 3, notes: ['current'] })

  assert.equal(state.slideNumber, 2)
  assert.equal(state.slideCount, 3)
  assert.deepEqual(state.notes, ['current'])
})

test('deck peer id collision clears stored generated id and retries', function () {
  const storage = memoryStorage()
  const state = {
    opts: { sessionStorage: storage, location: 'https://talk.example/deck' },
    status: 'Starting remote...'
  }
  const key = remote.getDeckPeerIdStorageKey(state.opts)
  storage.setItem(key, 'deck-stale')

  const peers = []
  function Peer (id) {
    this.id = id
    this.destroyed = false
    this.handlers = {}
    this.on = function (event, handler) {
      this.handlers[event] = handler
    }
    this.destroy = function () {
      this.destroyed = true
    }
    peers.push(this)
  }

  state.peer = new Peer('deck-stale')

  assert.equal(remote.recoverDeckPeerId(null, state, { type: 'unavailable-id', message: 'ID is taken' }, Peer), true)
  assert.equal(peers[0].destroyed, true)
  assert.equal(peers.length, 2)
  assert.notEqual(peers[1].id, 'deck-stale')
  assert.equal(storage.getItem(key), peers[1].id)
})

test('explicit deck peer id collision reports error without regenerating id', function () {
  const storage = memoryStorage()
  const state = {
    opts: { peerId: 'deck-explicit', sessionStorage: storage, location: 'https://talk.example/deck' },
    peer: { destroy: function () { throw new Error('should not destroy') } }
  }

  assert.equal(remote.recoverDeckPeerId(null, state, { type: 'unavailable-id', message: 'ID is taken' }, function Peer () {}), false)
  assert.equal(remote.getDeckPeerId(state), 'deck-explicit')
})

test('locked controller does not schedule reconnect', function () {
  let scheduled = false
  const state = {
    opts: {
      setTimeout: function () {
        scheduled = true
      }
    },
    peer: {},
    deckId: 'deck-1',
    deckLocked: true,
    reconnectTimer: null
  }

  assert.equal(remote.scheduleControllerReconnect(null, state), false)
  assert.equal(scheduled, false)
})

test('normalizes PeerJS constructor exports from ESM and CommonJS bundles', function () {
  function Peer () {}

  assert.equal(remote.normalizePeerExport(Peer), Peer)
  assert.equal(remote.normalizePeerExport({ Peer }), Peer)
  assert.equal(remote.normalizePeerExport({ default: Peer }), Peer)
  assert.equal(remote.normalizePeerExport({ default: { Peer } }), Peer)
  assert.equal(remote.normalizePeerExport({}), null)
})

test('PeerJS unavailable resets deck remote state so the enable action is retryable', function () {
  const state = { remoteEnabled: true, status: 'Creating remote URL...' }

  remote.markPeerUnavailable(state)

  assert.equal(state.remoteEnabled, false)
  assert.match(state.status, /^PeerJS unavailable/)
})

test('controller client id is generated once and persisted for hello messages', function () {
  const storage = memoryStorage()
  const first = remote.getOrCreateClientId(storage, remote.CLIENT_ID_STORAGE_KEY)
  const second = remote.getOrCreateClientId(storage, remote.CLIENT_ID_STORAGE_KEY)

  assert.match(first, /^client-/)
  assert.equal(second, first)
  assert.deepEqual(remote.buildHelloMessage('pair-1', first), {
    type: 'hello',
    pairKey: 'pair-1',
    clientId: first
  })
})

test('generates stronger IDs with crypto when available', function () {
  assert.equal(remote.generateId('pair', { randomUUID: function () { return 'uuid-123' } }), 'pair-uuid-123')

  const id = remote.generateId('pair', {
    getRandomValues: function (bytes) {
      for (let i = 0; i < bytes.length; i++) bytes[i] = i
      return bytes
    }
  })

  assert.equal(id, 'pair-000102030405060708090a0b0c0d0e0f')
})

test('remote goto clamps slide numbers to the deck range', function () {
  assert.equal(remote.clampSlideNumber(0, 5), 1)
  assert.equal(remote.clampSlideNumber(-10, 5), 1)
  assert.equal(remote.clampSlideNumber('3', 5), 3)
  assert.equal(remote.clampSlideNumber(99, 5), 5)
  assert.equal(remote.clampSlideNumber('wat', 5), 1)
  assert.equal(remote.getGotoHash(99, 5), '/5')
})

test('controller preview numbers follow current and next slide edge cases', function () {
  assert.deepEqual(remote.getPreviewSlideNumbers(1, 5), {
    current: 1,
    next: 2,
    slideCount: 5
  })

  assert.deepEqual(remote.getPreviewSlideNumbers(5, 5), {
    current: 5,
    next: null,
    slideCount: 5
  })

  assert.deepEqual(remote.getPreviewSlideNumbers(99, 5), {
    current: 5,
    next: null,
    slideCount: 5
  })

  assert.deepEqual(remote.getPreviewSlideNumbers('wat', 5), {
    current: 1,
    next: 2,
    slideCount: 5
  })

  assert.deepEqual(remote.getPreviewSlideNumbers(1, 0), {
    current: null,
    next: null,
    slideCount: 0
  })
})

test('classifies preview slide definitions without requiring a browser DOM', function () {
  const fakeDomNode = {
    nodeType: 1,
    cloneNode: function () { return { nodeType: 1 } }
  }
  function renderFn () {}

  assert.equal(remote.getPreviewSlideKind('Title'), 'string')
  assert.equal(remote.getPreviewSlideKind(renderFn), 'function')
  assert.equal(remote.getPreviewSlideKind(fakeDomNode), 'dom')
  assert.equal(remote.getPreviewSlideKind({ title: 'Unsupported' }), 'fallback')
})

test('builds defensive preview models for missing and available slides', function () {
  const slides = ['Intro', function chart () {}, null]

  assert.deepEqual(remote.getPreviewSlideModel(slides, 1), {
    available: true,
    kind: 'string',
    slideNumber: 1,
    slide: 'Intro',
    message: ''
  })

  assert.deepEqual(remote.getPreviewSlideModel(slides, 3), {
    available: false,
    kind: 'missing',
    slideNumber: 3,
    slide: null,
    message: 'Slide unavailable'
  })

  assert.deepEqual(remote.getPreviewSlideModel(slides, 4), {
    available: false,
    kind: 'empty',
    slideNumber: null,
    slide: null,
    message: 'No next slide'
  })
})

test('controller timer formats elapsed seconds as MM:SS', function () {
  assert.equal(remote.formatControllerTimer(0), '00:00')
  assert.equal(remote.formatControllerTimer(9), '00:09')
  assert.equal(remote.formatControllerTimer(65), '01:05')
  assert.equal(remote.formatControllerTimer(3601), '60:01')
  assert.equal(remote.formatControllerTimer(-10), '00:00')
})

test('controller timer elapsed seconds clamp before start and before first full second', function () {
  assert.equal(remote.getControllerTimerSeconds({}, 12000), 0)
  assert.equal(remote.getControllerTimerSeconds({ timerStartedAt: 0, timerNow: 3500 }), 3)
  assert.equal(remote.getControllerTimerSeconds({ timerStartedAt: 10000, timerNow: 10500 }), 0)
  assert.equal(remote.getControllerTimerSeconds({ timerStartedAt: 10000, timerNow: 12999 }), 2)
  assert.equal(remote.getControllerTimerSeconds({ timerStartedAt: 10000 }, 71000), 61)
  assert.equal(remote.getControllerTimerSeconds({ timerStartedAt: 10000 }, 9000), 0)
})

test('controller slide timer formats elapsed seconds as compact human text', function () {
  assert.equal(remote.formatControllerSlideTimer(0), '0s')
  assert.equal(remote.formatControllerSlideTimer(9), '9s')
  assert.equal(remote.formatControllerSlideTimer(65), '1m 5s')
  assert.equal(remote.formatControllerSlideTimer(4803), '1h 20m 3s')
  assert.equal(remote.formatControllerSlideTimer(-10), '0s')

  assert.equal(remote.formatControllerSlideTimer(remote.getControllerSlideTimerSeconds({}, 12000)), '0s')
  assert.equal(remote.formatControllerSlideTimer(remote.getControllerSlideTimerSeconds({ slideTimerStartedAt: 0, slideTimerNow: 3500 })), '3s')
  assert.equal(remote.formatControllerSlideTimer(remote.getControllerSlideTimerSeconds({ slideTimerStartedAt: 10000, slideTimerNow: 12999 })), '2s')
  assert.equal(remote.formatControllerSlideTimer(remote.getControllerSlideTimerSeconds({ slideTimerStartedAt: 10000 }, 71000)), '1m 1s')
  assert.equal(remote.formatControllerSlideTimer(remote.getControllerSlideTimerSeconds({ slideTimerStartedAt: 10000 }, 9000)), '0s')
})

test('controller talk timer formats elapsed seconds without seconds', function () {
  assert.equal(remote.formatControllerTalkTimer(0), '0m')
  assert.equal(remote.formatControllerTalkTimer(9), '0m')
  assert.equal(remote.formatControllerTalkTimer(65), '1m')
  assert.equal(remote.formatControllerTalkTimer(3599), '59m')
  assert.equal(remote.formatControllerTalkTimer(3600), '1h')
  assert.equal(remote.formatControllerTalkTimer(4803), '1h 20m')
  assert.equal(remote.formatControllerTalkTimer(-10), '0m')
})

test('controller talk estimate formats approximate totals without seconds', function () {
  assert.equal(remote.formatControllerTalkEstimate(0), '~0m')
  assert.equal(remote.formatControllerTalkEstimate(2399), '~40m')
  assert.equal(remote.formatControllerTalkEstimate(2415), '~40m')
  assert.equal(remote.formatControllerTalkEstimate(4803), '~1h 20m')
})

test('controller talk estimate uses robust completed-slide pace with an early prior', function () {
  assert.equal(remote.getRobustCompletedSlideDurationSeconds([]), 0)
  assert.equal(remote.getRobustCompletedSlideDurationSeconds([10, 50, 60, 70, 600]), 60)
  assert.equal(remote.getEstimatedControllerSlidePaceSeconds([]), remote.DEFAULT_CONTROLLER_SLIDE_DURATION_SECONDS)
  assert.equal(remote.getEstimatedControllerSlidePaceSeconds([{ slideNumber: 1, durationSeconds: 30 }]), 60)
  assert.equal(remote.getEstimatedControllerSlidePaceSeconds([{ durationSeconds: 30 }, { durationSeconds: 60 }]), 55)
  assert.equal(remote.getEstimatedControllerSlidePaceSeconds([{ durationSeconds: 30 }, { durationSeconds: 60 }, { durationSeconds: 600 }]), 60)

  const state = {
    timerStartedAt: 0,
    timerNow: 240000,
    slideTimerStartedAt: 165000,
    slideTimerNow: 240000,
    slideNumber: 3,
    slideCount: 32,
    completedSlideDurations: [{ durationSeconds: 60 }, { durationSeconds: 90 }]
  }

  assert.equal(remote.getEstimatedControllerTalkDurationSeconds(state), 2415)
  assert.equal(remote.formatControllerTalkTimerDisplay(state), '4m / ~40m')
})

test('controller slide position text clamps current and total slide counts', function () {
  assert.equal(remote.getControllerSlidePositionText({ slideNumber: 1, slideCount: 12 }), '1/12')
  assert.equal(remote.getControllerSlidePositionText({ slideNumber: 99, slideCount: 12 }), '12/12')
  assert.equal(remote.getControllerSlidePositionText({ slideNumber: 0, slideCount: 12 }), '1/12')
  assert.equal(remote.getControllerSlidePositionText({ slideNumber: 1, slideCount: 0 }), '0/0')
})

test('controller status tone maps common connection states', function () {
  assert.equal(remote.getControllerStatusTone('Connected to deck'), 'green')
  assert.equal(remote.getControllerStatusTone('Remote connected'), 'green')
  assert.equal(remote.getControllerStatusTone('Connecting to deck...'), 'yellow')
  assert.equal(remote.getControllerStatusTone('Reconnecting to deck...'), 'yellow')
  assert.equal(remote.getControllerStatusTone('Remote ready'), 'yellow')
  assert.equal(remote.getControllerStatusTone('Remote peer ID busy. Retrying...'), 'yellow')
  assert.equal(remote.getControllerStatusTone('Deck locked to another controller'), 'red')
  assert.equal(remote.getControllerStatusTone('Disconnected from deck'), 'red')
  assert.equal(remote.getControllerStatusTone('PeerJS unavailable. Load PeerJS and try again.'), 'red')
  assert.equal(remote.getControllerStatusTone('Remote error'), 'red')
})

test('controller slide timer starts and resets only when the deck slide changes', function () {
  let now = 0
  const state = {
    opts: { now: function () { return now } },
    timerStartedAt: 0,
    timerNow: 0,
    slideNumber: 1,
    slideCount: 3,
    notes: []
  }

  assert.equal(remote.handleControllerData(state, { type: 'state', slideNumber: 1, slideCount: 3, notes: ['one'] }), true)
  assert.equal(state.slideTimerStartedAt, 0)
  assert.equal(state.slideTimerNow, 0)
  assert.deepEqual(state.completedSlideDurations, [])
  assert.equal(remote.getControllerSlideTimerSeconds(state), 0)

  now = 2500
  assert.equal(remote.handleControllerData(state, { type: 'state', slideNumber: 1, slideCount: 3, notes: ['one again'] }), true)
  assert.equal(state.slideTimerStartedAt, 0)
  assert.equal(state.slideTimerNow, 2500)
  assert.deepEqual(state.completedSlideDurations, [])
  assert.equal(remote.getControllerSlideTimerSeconds(state), 2)

  now = 8000
  assert.equal(remote.handleControllerData(state, { type: 'state', slideNumber: 2, slideCount: 3, notes: ['two'] }), true)
  assert.equal(state.slideNumber, 2)
  assert.equal(state.slideTimerStartedAt, 8000)
  assert.equal(state.slideTimerNow, 8000)
  assert.deepEqual(state.completedSlideDurations, [{ slideNumber: 1, durationSeconds: 8 }])
  assert.equal(remote.getControllerSlideTimerSeconds(state), 0)

  now = 9500
  assert.equal(remote.handleControllerData(state, { type: 'state', slideNumber: 2, slideCount: 3, notes: ['two again'] }), true)
  assert.deepEqual(state.completedSlideDurations, [{ slideNumber: 1, durationSeconds: 8 }])

  now = 13000
  assert.equal(remote.handleControllerData(state, { type: 'state', slideNumber: 3, slideCount: 3, notes: ['three'] }), true)
  assert.deepEqual(state.completedSlideDurations, [
    { slideNumber: 1, durationSeconds: 8 },
    { slideNumber: 2, durationSeconds: 5 }
  ])
})

test('controller timer start resets setup slide timing before recording completed pace', function () {
  let now = 0
  const intervals = []
  const connections = []
  const state = controllerReconnectState({
    opts: {
      now: function () { return now },
      setInterval: function (callback, delay) {
        const timer = { callback, delay, unref: function () {} }
        intervals.push(timer)
        return timer
      }
    },
    connections
  })
  state.role = 'controller'
  state.overlay = fakeElement('div')

  withFakeBrowser('https://talk.example/deck?ps-remote=deck-1&ps-pair=pair-1', function () {
    const conn = remote.connectControllerDeck(fakePS(), state)

    conn.emit('open')
    conn.emit('data', { type: 'state', slideNumber: 1, slideCount: 3, notes: [] })
    assert.equal(intervals.length, 1)

    now = 600000
    conn.emit('data', { type: 'state', slideNumber: 1, slideCount: 3, notes: ['setup'] })
    assert.deepEqual(state.completedSlideDurations, [])
    assert.equal(state.overlay.querySelector('.ps-controller-current-slide-timer').textContent, 'slide 10m 0s')
    assert.equal(state.overlay.querySelector('.ps-controller-presentation-timer').textContent, 'start timer')

    const startButton = findButtonByText(state.overlay, 'start timer')
    assert.ok(startButton)
    startButton.onclick()

    assert.equal(state.timerStartedAt, 600000)
    assert.equal(state.slideTimerStartedAt, 600000)
    assert.equal(state.slideTimerNow, 600000)
    assert.deepEqual(state.completedSlideDurations, [])
    assert.equal(state.overlay.querySelector('.ps-controller-current-slide-timer').textContent, 'slide 0s')
    assert.equal(state.overlay.querySelector('.ps-controller-presentation-timer').textContent, 'talk 0m / ~4m')

    now = 610000
    conn.emit('data', { type: 'state', slideNumber: 2, slideCount: 3, notes: [] })

    assert.deepEqual(state.completedSlideDurations, [{ slideNumber: 1, durationSeconds: 10 }])
    assert.equal(remote.getEstimatedControllerSlidePaceSeconds(state.completedSlideDurations), 53)
    assert.equal(remote.getEstimatedControllerTalkDurationSeconds(state, now), 116)
    assert.equal(state.overlay.querySelector('.ps-controller-presentation-timer').textContent, 'talk 0m / ~2m')
  })
})

test('controller timer ticks update display text without rebuilding preview frames', function () {
  let now = 0
  const intervals = []
  const connections = []
  const state = controllerReconnectState({
    opts: {
      now: function () { return now },
      setInterval: function (callback, delay) {
        const timer = { callback, delay, unref: function () {} }
        intervals.push(timer)
        return timer
      }
    },
    connections
  })
  state.role = 'controller'
  state.overlay = fakeElement('div')
  state.timerStartedAt = null
  state.timerNow = null
  state.slideTimerStartedAt = null
  state.slideTimerNow = null
  state.timerInterval = null

  withFakeBrowser('https://talk.example/deck?ps-remote=deck-1&ps-pair=pair-1', function () {
    const conn = remote.connectControllerDeck(fakePS(), state)

    conn.emit('open')
    conn.emit('data', { type: 'state', slideNumber: 1, slideCount: 2, notes: [] })

    assert.equal(intervals.length, 1)
    assert.equal(intervals[0].delay, 1000)

    const framesAfterState = state.overlay.querySelectorAll('.ps-controller-preview-frame')
    assert.equal(framesAfterState.length, 2)
    const topBar = state.overlay.querySelector('.ps-controller-top-bar')
    const topLeft = state.overlay.querySelector('.ps-controller-top-left')
    const topCenter = state.overlay.querySelector('.ps-controller-top-center')
    const topRight = state.overlay.querySelector('.ps-controller-top-right')
    const statusDot = state.overlay.querySelector('.ps-controller-status-dot')
    const slidePosition = state.overlay.querySelector('.ps-controller-slide-position')
    const talkTimerPill = state.overlay.querySelector('.ps-controller-presentation-timer')
    const currentSlideTimer = state.overlay.querySelector('.ps-controller-current-slide-timer')
    const previewLabels = state.overlay.querySelectorAll('.ps-controller-preview-label')
    const nextBadges = state.overlay.querySelectorAll('.ps-controller-next-preview-badge')

    assert.equal(topBar.style.display, 'grid')
    assert.equal(topBar.style['grid-template-columns'], '1fr auto 1fr')
    assert.equal(topBar.style.padding, '0')
    assert.equal(topBar.style.border, '0')
    assert.equal(topBar.style.background, 'transparent')
    assert.equal(currentSlideTimer.parentNode, topLeft)
    assert.equal(currentSlideTimer.textContent, 'slide 0s')
    assert.equal(currentSlideTimer['aria-label'], 'Current slide duration')
    assert.equal(statusDot.parentNode, topCenter)
    assert.equal(slidePosition.parentNode, topCenter)
    assert.equal(topCenter.textContent, '1/2')
    assert.equal(slidePosition.textContent, '1/2')
    assert.equal(slidePosition['aria-label'], 'slide 1/2')
    assert.equal(slidePosition.style['text-transform'], 'none')
    assert.equal(talkTimerPill.parentNode, topRight)
    assert.equal(talkTimerPill.style.padding, '0')
    assert.equal(talkTimerPill.style.border, '0')
    assert.equal(talkTimerPill.style.background, 'transparent')
    assert.equal(talkTimerPill.textContent, 'start timer')
    assert.equal(state.overlay.querySelector('.ps-controller-timer-display'), null)
    assert.equal(previewLabels.length, 0)
    assert.equal(nextBadges.length, 1)
    assert.equal(nextBadges[0].textContent, 'next')
    assert.ok(String(nextBadges[0].parentNode.className).indexOf('ps-controller-preview-body') !== -1)
    assert.equal(nextBadges[0].style.position, 'absolute')
    assert.equal(nextBadges[0].style.top, '0')
    assert.equal(nextBadges[0].style.left, '0')
    assert.equal(nextBadges[0].style.border, undefined)
    assert.equal(statusDot.textContent, '')
    assert.equal(statusDot.title, 'Connected to deck')
    assert.equal(statusDot['aria-label'], 'Status: Connected to deck')
    assert.equal(statusDot.style.background, remote.getControllerStatusColor('Connected to deck'))
    assert.equal(state.overlay.querySelector('.ps-controller-slide-timer-display').textContent, '0s')
    assert.equal(state.overlay.querySelector('.ps-controller-timer-display'), null)

    now = 2500
    conn.emit('data', { type: 'state', slideNumber: 1, slideCount: 2, notes: ['same slide'] })

    const framesAfterSameSlideState = state.overlay.querySelectorAll('.ps-controller-preview-frame')
    assert.equal(state.overlay.querySelector('.ps-controller-current-slide-timer'), currentSlideTimer)
    assert.equal(state.overlay.querySelector('.ps-controller-status-dot'), statusDot)
    assert.equal(state.overlay.querySelector('.ps-controller-current-slide-timer').textContent, 'slide 2s')
    assert.equal(state.overlay.querySelector('.ps-controller-slide-timer-display').textContent, '2s')
    assert.equal(state.overlay.querySelectorAll('.ps-controller-preview-label').length, 0)
    assert.equal(state.overlay.querySelector('.ps-controller-next-preview-badge'), nextBadges[0])
    assert.equal(framesAfterSameSlideState.length, 2)
    assert.equal(framesAfterSameSlideState[0], framesAfterState[0])
    assert.equal(framesAfterSameSlideState[1], framesAfterState[1])

    now = 3500
    intervals[0].callback()

    const framesAfterSlideTick = state.overlay.querySelectorAll('.ps-controller-preview-frame')
    assert.equal(state.overlay.querySelector('.ps-controller-current-slide-timer'), currentSlideTimer)
    assert.equal(currentSlideTimer.textContent, 'slide 3s')
    assert.equal(state.overlay.querySelector('.ps-controller-slide-timer-display').textContent, '3s')
    assert.equal(state.overlay.querySelector('.ps-controller-timer-display'), null)
    assert.equal(framesAfterSlideTick.length, 2)
    assert.equal(framesAfterSlideTick[0], framesAfterState[0])
    assert.equal(framesAfterSlideTick[1], framesAfterState[1])

    const startButton = findButtonByText(state.overlay, 'start timer')
    assert.ok(startButton)
    assert.equal(startButton.style.padding, '3px 8px')
    assert.equal(startButton.style.border, '1px solid rgba(255, 255, 255, 0.35)')
    startButton.onclick()

    const framesAfterStart = state.overlay.querySelectorAll('.ps-controller-preview-frame')
    const currentSlideTimerAfterStart = state.overlay.querySelector('.ps-controller-current-slide-timer')
    const talkTimerAfterStart = state.overlay.querySelector('.ps-controller-timer-display')
    assert.equal(framesAfterStart.length, 2)
    assert.equal(intervals.length, 1)
    assert.equal(findButtonByText(state.overlay, 'start timer'), null)
    assert.ok(talkTimerAfterStart)
    assert.equal(currentSlideTimerAfterStart.textContent, 'slide 0s')
    assert.equal(state.overlay.querySelector('.ps-controller-slide-timer-display').textContent, '0s')
    assert.equal(talkTimerAfterStart.textContent, '0m / ~3m')
    assert.equal(state.overlay.querySelector('.ps-controller-presentation-timer').textContent, 'talk 0m / ~3m')

    now = 6500
    intervals[0].callback()

    const framesAfterPresentationTick = state.overlay.querySelectorAll('.ps-controller-preview-frame')
    assert.equal(state.overlay.querySelector('.ps-controller-current-slide-timer'), currentSlideTimerAfterStart)
    assert.equal(currentSlideTimerAfterStart.textContent, 'slide 3s')
    assert.equal(state.overlay.querySelector('.ps-controller-slide-timer-display').textContent, '3s')
    assert.equal(state.overlay.querySelector('.ps-controller-timer-display').textContent, '0m / ~3m')
    assert.equal(state.overlay.querySelector('.ps-controller-presentation-timer').textContent, 'talk 0m / ~3m')
    assert.equal(framesAfterPresentationTick.length, 2)
    assert.equal(framesAfterPresentationTick[0], framesAfterStart[0])
    assert.equal(framesAfterPresentationTick[1], framesAfterStart[1])

    now = 68500
    intervals[0].callback()

    const framesAfterPresentationMinuteTick = state.overlay.querySelectorAll('.ps-controller-preview-frame')
    assert.equal(state.overlay.querySelector('.ps-controller-current-slide-timer'), currentSlideTimerAfterStart)
    assert.equal(currentSlideTimerAfterStart.textContent, 'slide 1m 5s')
    assert.equal(state.overlay.querySelector('.ps-controller-slide-timer-display').textContent, '1m 5s')
    assert.equal(state.overlay.querySelector('.ps-controller-timer-display').textContent, '1m / ~3m')
    assert.equal(state.overlay.querySelector('.ps-controller-presentation-timer').textContent, 'talk 1m / ~3m')
    assert.equal(framesAfterPresentationMinuteTick.length, 2)
    assert.equal(framesAfterPresentationMinuteTick[0], framesAfterStart[0])
    assert.equal(framesAfterPresentationMinuteTick[1], framesAfterStart[1])
  })
})

test('controller previews contain-scale a full 16:9 iframe viewport', function () {
  assert.equal(remote.PREVIEW_ASPECT_RATIO, '1280 / 720')

  const viewportStyle = remote.getPreviewViewportStyle()
  assert.equal(viewportStyle.width, '100%')
  assert.equal(viewportStyle['aspect-ratio'], '1280 / 720')
  assert.equal(viewportStyle.position, 'relative')
  assert.equal(viewportStyle.overflow, 'hidden')
  assert.equal(viewportStyle['touch-action'], 'none')
  assert.equal(viewportStyle['user-select'], 'none')

  const stageStyle = remote.getPreviewStageStyle(0.5)
  assert.equal(stageStyle.width, '1280px')
  assert.equal(stageStyle.height, '720px')
  assert.equal(stageStyle.transform, 'translate(-50%, -50%) scale(0.5)')
  assert.equal(stageStyle['transform-origin'], 'center center')
  assert.equal(stageStyle.overflow, 'visible')
  assert.equal(stageStyle.border, 0)
  assert.equal(stageStyle['touch-action'], 'none')

  assert.equal(remote.getPreviewStageScale(320, 180), 0.25)
  assert.equal(remote.getPreviewStageScale(320, 320), 0.25)
  assert.equal(remote.getPreviewStageScale(640, 180), 0.25)
  assert.equal(remote.getPreviewStageScale(640, 360), 0.5)
})

test('generates an inline QR SVG for the remote URL', function () {
  const svg = remote.createQrSvg('https://talk.example/deck?ps-remote=deck-1&ps-pair=pair-1')

  assert.match(svg, /^<svg/)
  assert.match(svg, /path/)
})

test('o opens options unless the user is typing or using a modifier chord', function () {
  assert.equal(remote.isOptionsKey({ key: 'o', target: { tagName: 'DIV' } }), true)
  assert.equal(remote.isOptionsKey({ key: 'O', target: { tagName: 'DIV' } }), true)
  assert.equal(remote.isOptionsKey({ key: 'o', ctrlKey: true, target: { tagName: 'DIV' } }), false)
  assert.equal(remote.isOptionsKey({ key: 'o', target: { tagName: 'INPUT' } }), false)
  assert.equal(remote.isOptionsKey({ key: 'o', target: { isContentEditable: true } }), false)
})

test('options panel version follows package.json', function () {
  assert.equal(remote.PACKAGE_VERSION, packageJson.version)
})

test('documents the visible options button hide delay', function () {
  assert.equal(remote.DEFAULT_BUTTON_HIDE_MS, 5000)
})

function deckState (storage) {
  return {
    opts: { sessionStorage: storage },
    peerId: 'deck-1',
    pairKey: 'pair-1',
    controllerId: null,
    activeConnection: null,
    connections: []
  }
}

function fakeConnection () {
  return {
    open: true,
    sent: [],
    closed: false,
    send: function (message) {
      this.sent.push(message)
    },
    close: function () {
      this.closed = true
    }
  }
}

function controllerReconnectState (opts) {
  opts = opts || {}
  const connections = opts.connections || []

  return {
    opts: opts.opts || {},
    peer: {
      connect: function (id, connectOpts) {
        const conn = fakeEventConnection(id, connectOpts)
        connections.push(conn)
        return conn
      }
    },
    deckId: 'deck-1',
    clientId: 'client-a',
    pairKey: 'pair-1',
    status: '',
    deckLocked: false,
    deckConnection: null,
    reconnectTimer: null,
    reconnectAttempts: 0,
    slideNumber: 1,
    slideCount: 3,
    notes: []
  }
}

function fakeEventConnection (id, opts) {
  const handlers = {}

  return {
    id,
    opts,
    open: true,
    sent: [],
    on: function (event, handler) {
      handlers[event] = handler
    },
    emit: function (event, message) {
      if (handlers[event]) handlers[event](message)
    },
    send: function (message) {
      this.sent.push(message)
    },
    close: function () {
      this.open = false
      this.emit('close')
    }
  }
}

function fakePS () {
  return {
    slides: ['Intro'],
    notes: [[]],
    getCurrentSlideNumber: function () { return 1 },
    on: function () {}
  }
}

function fakePeerClass (peers) {
  return function Peer (id, opts) {
    this.id = id
    this.opts = opts
    this.handlers = {}
    this.on = function (event, handler) {
      this.handlers[event] = handler
    }
    this.emit = function (event, value) {
      if (this.handlers[event]) this.handlers[event](value)
    }
    peers.push(this)
  }
}

function withFakeBrowser (href, callback) {
  const previousWindow = global.window
  const previousDocument = global.document
  const previousText = global.Text
  const previousSetTimeout = global.setTimeout
  const previousRequestAnimationFrame = global.requestAnimationFrame

  const url = new URL(href)

  global.Text = FakeText
  global.document = fakeDocument()
  global.window = {
    location: {
      href,
      hash: url.hash,
      search: url.search,
      origin: url.origin,
      pathname: url.pathname
    },
    addEventListener: function () {}
  }
  global.setTimeout = function () { return 1 }
  global.requestAnimationFrame = function (fn) {
    fn()
    return 1
  }

  try {
    callback()
  } finally {
    restoreGlobal('window', previousWindow)
    restoreGlobal('document', previousDocument)
    restoreGlobal('Text', previousText)
    restoreGlobal('setTimeout', previousSetTimeout)
    restoreGlobal('requestAnimationFrame', previousRequestAnimationFrame)
  }
}

function restoreGlobal (name, value) {
  if (typeof value === 'undefined') {
    delete global[name]
    return
  }

  global[name] = value
}

function fakeDocument () {
  return {
    body: fakeElement('body'),
    documentElement: fakeElement('html'),
    createElement: function (tag) { return fakeElement(tag) },
    createTextNode: function (text) { return new FakeText(text) }
  }
}

function fakeElement (tag) {
  const element = {
    nodeName: String(tag || 'div').toUpperCase(),
    nodeType: 1,
    className: '',
    childNodes: [],
    style: fakeStyle(),
    appendChild: function (child) {
      child.parentNode = this
      this.childNodes.push(child)
      return child
    },
    removeChild: function (child) {
      this.childNodes = this.childNodes.filter(function (item) {
        return item !== child
      })
      child.parentNode = null
      return child
    },
    setAttribute: function (name, value) {
      this[name] = String(value)
    },
    addEventListener: function (event, handler) {
      this['on' + event] = handler
    },
    removeEventListener: function () {},
    querySelector: function (selector) {
      return this.querySelectorAll(selector)[0] || null
    },
    querySelectorAll: function (selector) {
      const matches = []
      collectMatches(this, selector, matches)
      return matches
    },
    cloneNode: function () { return fakeElement(tag) }
  }

  Object.defineProperty(element, 'innerHTML', {
    get: function () { return '' },
    set: function () {
      this.childNodes.forEach(function (child) {
        child.parentNode = null
      })
      this.childNodes = []
    }
  })

  Object.defineProperty(element, 'textContent', {
    get: function () {
      return this.childNodes.map(function (child) {
        return child.textContent || ''
      }).join('')
    },
    set: function (value) {
      this.innerHTML = ''
      if (value !== '') this.appendChild(new FakeText(value))
    }
  })

  return element
}

function collectMatches (element, selector, matches) {
  element.childNodes.forEach(function (child) {
    if (matchesSelector(child, selector)) matches.push(child)
    if (child.childNodes) collectMatches(child, selector, matches)
  })
}

function matchesSelector (element, selector) {
  if (!element || element.nodeType !== 1) return false

  if (selector[0] === '.') {
    const className = selector.slice(1)
    return String(element.className || '').split(/\s+/).indexOf(className) !== -1
  }

  return element.nodeName === String(selector).toUpperCase()
}

function findButtonByText (root, text) {
  const buttons = root.querySelectorAll('button')
  for (let i = 0; i < buttons.length; i++) {
    if (buttons[i].textContent === text) return buttons[i]
  }
  return null
}

function fakeStyle () {
  return {
    cssText: '',
    setProperty: function (name, value) {
      this[name] = String(value)
    }
  }
}

function FakeText (text) {
  this.nodeName = '#text'
  this.nodeType = 3
  this.textContent = String(text)
}

function memoryStorage () {
  const values = {}

  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null
    },
    setItem: function (key, value) {
      values[key] = String(value)
    },
    removeItem: function (key) {
      delete values[key]
    }
  }
}
