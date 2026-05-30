const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const root = path.resolve(__dirname, '..')

test('public docs do not advertise presenter mode or isPresenter', function () {
  for (const file of ['README.md', 'docs/slide-api-v3.md']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8')
    assert.equal(/isPresenter/.test(text), false, file + ' omits isPresenter')
    assert.equal(/presenter/i.test(text), false, file + ' omits presenter mode language')
    assert.equal(/ps-notes/.test(text), false, file + ' omits ps-notes implementation details')
  }
})

test('CommonJS runtime ignores stale presenter options and creates no notes pane', function () {
  const output = execFileSync(process.execPath, ['-e', runtimeSmoke('require')], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.equal(output.trim(), 'ok')
})

test('ESM runtime ignores stale presenter options and creates no notes pane', function () {
  const output = execFileSync(process.execPath, ['-e', runtimeSmoke('import')], {
    cwd: root,
    encoding: 'utf8'
  })
  assert.equal(output.trim(), 'ok')
})

function runtimeSmoke (mode) {
  return `
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')

function createStyle () {
  return {}
}

class FakeElement {
  constructor (tagName) {
    this.tagName = tagName
    this.children = []
    this.attributes = {}
    this.style = createStyle()
    this.className = ''
    this.innerHTML = ''
    this.nodeType = 1
    this.nodeName = String(tagName).toUpperCase()
  }

  appendChild (child) {
    this.children.push(child)
    return child
  }

  setAttribute (name, value) {
    this.attributes[name] = String(value)
    if (name === 'class') this.className = String(value)
  }
}

global.document = {
  createElement (tagName) {
    return new FakeElement(tagName)
  },
  createTextNode (text) {
    return String(text)
  }
}
global.window = {
  innerWidth: 1024,
  innerHeight: 768,
  location: {
    hash: '',
    search: '',
    href: 'https://talk.example/',
    origin: 'https://talk.example',
    pathname: '/'
  },
  addEventListener () {}
}
global.Element = FakeElement
global.DocumentFragment = FakeElement

function getStyleValue (el, name) {
  if (!el || !el.style) return undefined
  if (typeof el.style[name] !== 'undefined') return el.style[name]
  const entry = (el.style.styles || []).find(item => item.name === name)
  return entry && entry.value
}

function findDeep (root, predicate) {
  if (!root) return undefined
  if (predicate(root)) return root
  for (const child of root.children || root.childNodes || []) {
    const found = findDeep(child, predicate)
    if (found) return found
  }
}

async function main () {
  const PS = ${mode === 'require'
    ? "require('./index.js')"
    : "(await import(pathToFileURL(require('node:path').resolve('index.mjs')).href + '?presenter-removal=' + Date.now())).default"}
  const target = new FakeElement('section')
  PS.start(target, [['Legacy slide', 'legacy note']], { isPresenter: true })
  const slide = findDeep(target, el => String(el.className).split(/\\s+/).includes('ps-slide'))
  assert(slide, 'runtime creates the slide container')
  assert.equal(getStyleValue(slide, 'height'), '100%', 'slide keeps full height even with stale isPresenter option')
  assert.equal(findDeep(target, el => String(el.className).split(/\\s+/).includes('ps-notes')), undefined, 'runtime does not create notes pane')
  assert.deepEqual(PS.notes[0], ['legacy note'], 'legacy note metadata remains available for compatibility')
  console.log('ok')
}

main().catch(err => {
  console.error(err.stack || err)
  process.exit(1)
})
`
}
