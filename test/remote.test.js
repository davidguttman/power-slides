const test = require('node:test')
const assert = require('node:assert/strict')
const remote = require('../remote')._test

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

function memoryStorage () {
  const values = {}

  return {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null
    },
    setItem: function (key, value) {
      values[key] = String(value)
    }
  }
}
