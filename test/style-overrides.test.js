const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const root = path.resolve(__dirname, '..')

async function loadPowerSlides () {
  return import(pathToFileURL(path.join(root, 'index.mjs')).href + '?style-overrides=' + Date.now())
}

test('text slides accept object and CSS string style overrides', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    const target = new FakeElement('section')
    mod.text({
      eyebrow: 'Intro',
      eyebrowStyle: 'letter-spacing: 0.1em; opacity: 1',
      title: 'Styled title',
      titleStyle: 'font-size: 12pt; color: red',
      subtitle: 'Styled subtitle',
      subtitleStyle: { opacity: 0.9, fontSize: '20px' }
    })(target)

    const title = findDeep(target, el => el.tagName === 'h1')
    const eyebrow = findDeep(target, el => elementText(el) === 'Intro')
    const subtitle = findDeep(target, el => elementText(el) === 'Styled subtitle')

    assert.equal(title.style.fontSize, '12pt', 'CSS string titleStyle applies font-size')
    assert.equal(title.style.color, 'red', 'CSS string titleStyle applies camel-cased CSS')
    assert.equal(eyebrow.style.letterSpacing, '0.1em', 'CSS string eyebrowStyle applies kebab-case CSS')
    assert.equal(eyebrow.style.opacity, '1', 'CSS string eyebrowStyle can override defaults')
    assert.equal(subtitle.style.fontSize, '20px', 'object subtitleStyle preserves existing object behavior')
    assert.equal(subtitle.style.opacity, 0.9, 'object subtitleStyle applies opacity')
  })
})

test('legacy text style size and opacity knobs are ignored', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    const target = new FakeElement('section')
    mod.text({
      title: 'Default title',
      titleSize: '6vw',
      subtitle: 'Default subtitle',
      subtitleSize: '99px',
      subtitleOpacity: 0.25
    })(target)

    const title = findDeep(target, el => el.tagName === 'h1')
    const subtitle = findDeep(target, el => elementText(el) === 'Default subtitle')

    assert.equal(title.style.fontSize, '4.8vw', 'titleSize does not affect text title font size')
    assert.equal(subtitle.style.fontSize, '1.8vw', 'subtitleSize does not affect text subtitle font size')
    assert.equal(subtitle.style.opacity, 0.88, 'subtitleOpacity does not affect text subtitle opacity')
  })
})

test('columns accept object and CSS string style overrides for copy and media escape hatches', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    const target = new FakeElement('section')
    mod.columns({
      columnStyle: 'gap: 9px; align-items: center',
      columns: [
        {
          title: 'Column title',
          titleStyle: { fontSize: '22px', color: 'blue' },
          text: 'Column copy',
          textStyle: 'font-size: 18px; color: green',
          bullets: ['One'],
          bulletsStyle: 'padding-left: 2rem'
        },
        {
          image: '/image.png',
          mediaStyle: 'justify-content: flex-start',
          imageStyle: 'max-height: 20vh; border-radius: 0'
        }
      ]
    })(target)

    const column = findDeep(target, el => String(el.className).includes('ps-columns-column-1'))
    const heading = findDeep(target, el => el.tagName === 'h2')
    const copy = findDeep(target, el => elementText(el) === 'Column copy')
    const bullets = findDeep(target, el => el.tagName === 'ul')
    const media = findDeep(target, el => String(el.className).includes('ps-columns-image-media'))
    const image = findDeep(target, el => el.tagName === 'img')

    assert.equal(column.style.gap, '9px', 'CSS string columnStyle applies to column wrappers')
    assert.equal(column.style.alignItems, 'center', 'CSS string columnStyle converts kebab-case')
    assert.equal(heading.style.fontSize, '22px', 'object titleStyle applies in columns')
    assert.equal(heading.style.color, 'blue', 'object titleStyle applies in columns')
    assert.equal(copy.style.fontSize, '18px', 'CSS string textStyle applies to column copy')
    assert.equal(copy.style.color, 'green', 'CSS string textStyle applies color')
    assert.equal(bullets.style.paddingLeft, '2rem', 'CSS string bulletsStyle applies to lists')
    assert.equal(media.style.justifyContent, 'flex-start', 'CSS string mediaStyle applies to media wrapper')
    assert.equal(image.style.maxHeight, '20vh', 'CSS string imageStyle overrides image sizing')
    assert.equal(image.style.borderRadius, '0', 'CSS string imageStyle applies image shape')
  })
})

test('legacy column title size knob is ignored', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    const target = new FakeElement('section')
    mod.columns({
      columns: [
        {
          title: 'Column default title',
          titleSize: '44px'
        }
      ]
    })(target)

    const heading = findDeep(target, el => el.tagName === 'h2')

    assert.equal(heading.style.fontSize, 'clamp(2.2rem, 4.6vw, 5.2rem)', 'titleSize does not affect column heading font size')
  })
})

test('iframe device, layout, iframe, and side copy style overrides accept CSS strings', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    const target = new FakeElement('section')
    mod.iframe('https://example.test/app', {
      device: 'iphone',
      iframeStyle: 'border-radius: 20px',
      deviceStyle: 'width: 300px',
      layoutStyle: 'gap: 1rem',
      side: {
        title: 'Side title',
        body: 'Side body',
        bullets: ['Side bullet'],
        style: 'max-width: 20rem; color: yellow',
        titleStyle: 'font-size: 30px',
        bodyStyle: { fontSize: '16px' },
        bulletsStyle: 'margin-left: 2em'
      }
    })(target)

    const layout = findDeep(target, el => String(el.className).includes('ps-iframe-phone-layout'))
    const device = findDeep(target, el => String(el.className).includes('ps-iframe-device-iphone'))
    const frame = findDeep(target, el => el.tagName === 'iframe')
    const side = findDeep(target, el => String(el.className).includes('ps-iframe-side-copy'))
    const title = findDeep(target, el => String(el.className).includes('ps-iframe-side-title'))
    const body = findDeep(target, el => String(el.className).includes('ps-iframe-side-body'))
    const bullets = findDeep(target, el => String(el.className).includes('ps-iframe-side-bullets'))

    assert.equal(frame.style.borderRadius, '20px', 'CSS string iframeStyle applies to iframe')
    assert.equal(device.style.width, '300px', 'CSS string deviceStyle applies to phone frame')
    assert.equal(layout.style.gap, '1rem', 'CSS string layoutStyle applies to phone layout')
    assert.equal(side.style.maxWidth, '20rem', 'CSS string side.style applies to side copy')
    assert.equal(side.style.color, 'yellow', 'CSS string side.style can override color')
    assert.equal(title.style.fontSize, '30px', 'CSS string side titleStyle applies')
    assert.equal(body.style.fontSize, '16px', 'object side bodyStyle still works')
    assert.equal(bullets.style.marginLeft, '2em', 'CSS string side bulletsStyle applies')
  })
})

test('legacy iframe side title and subtitle knobs are ignored', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    const target = new FakeElement('section')
    mod.iframe('https://example.test/app', {
      device: 'iphone',
      side: {
        title: 'Default side title',
        titleSize: '44px',
        subtitle: 'Default side subtitle',
        subtitleSize: '22px',
        subtitleOpacity: 0.2
      }
    })(target)

    const title = findDeep(target, el => String(el.className).includes('ps-iframe-side-title'))
    const subtitle = findDeep(target, el => String(el.className).includes('ps-iframe-side-subtitle'))

    assert.equal(title.style.fontSize, 'clamp(2.4rem, 5vw, 4.8rem)', 'side.titleSize does not affect side title font size')
    assert.equal(subtitle.style.fontSize, 'clamp(1.1rem, 1.7vw, 1.55rem)', 'side.subtitleSize does not affect side subtitle font size')
    assert.equal(subtitle.style.opacity, 0.82, 'side.subtitleOpacity does not affect side subtitle opacity')
  })
})

function withFakeBrowser (fn) {
  const previousDocument = global.document
  const previousWindow = global.window
  global.document = createFakeDocument()
  global.window = createFakeWindow()
  try {
    fn()
  } finally {
    global.document = previousDocument
    global.window = previousWindow
  }
}

function findDeep (root, predicate) {
  if (!root) return undefined
  if (predicate(root)) return root
  for (const child of root.children || []) {
    if (typeof child === 'string') continue
    const found = findDeep(child, predicate)
    if (found) return found
  }
}

function elementText (el) {
  return (el.children || []).map(function (child) {
    if (typeof child === 'string') return child
    return elementText(child)
  }).join('')
}

function createFakeDocument () {
  return {
    body: new FakeElement('body'),
    createElement (tagName) {
      return new FakeElement(tagName)
    },
    createTextNode (text) {
      return String(text)
    }
  }
}

function createFakeWindow () {
  return {
    innerWidth: 1024,
    innerHeight: 768,
    location: {
      hash: '',
      search: '',
      href: 'https://talk.example/#/1',
      origin: 'https://talk.example',
      pathname: '/'
    },
    addEventListener () {},
    Image: function FakeImage () {}
  }
}

class FakeElement {
  constructor (tagName) {
    this.tagName = tagName
    this.children = []
    this.attributes = {}
    this.listeners = {}
    this.style = createFakeStyle()
    this.className = ''
    this.nodeType = tagName === '#text' ? 3 : 1
    this.nodeName = tagName === '#text' ? '#text' : String(tagName).toUpperCase()
    if (tagName === 'iframe') this.contentWindow = createFakeContentWindow()
  }

  appendChild (child) {
    this.children.push(child)
    if (child && typeof child === 'object') child.parentNode = this
    return child
  }

  setAttribute (key, value) {
    this.attributes[key] = value
  }

  addEventListener (name, fn) {
    this.listeners[name] = this.listeners[name] || []
    this.listeners[name].push(fn)
  }
}

function createFakeStyle () {
  return {
    setProperty (key, value) {
      this[key] = value
    }
  }
}

function createFakeContentWindow () {
  return {
    addEventListener () {}
  }
}
