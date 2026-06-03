const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const yaml = require('js-yaml')

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

test('iphone iframe defaults fit portrait mobile viewports without a tiny vw cap', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    global.window.innerWidth = 390
    global.window.innerHeight = 844
    const target = new FakeElement('section')
    mod.iframe('https://example.test/app', { device: 'iphone' })(target)

    const device = findDeep(target, el => String(el.className).includes('ps-iframe-device-iphone'))

    assert.equal(device.style.width, 'min(85vw, calc(85vh * 390 / 844), 430px)', 'default iPhone frame uses the available portrait viewport instead of a tiny vw cap')
    assert.equal(device.style.aspectRatio, '390 / 844', 'default iPhone frame preserves iPhone proportions')
  })
})

test('starter iframe slide uses mobile-friendly runtime iPhone frame width', async function () {
  const mod = await loadPowerSlides()
  const talk = await import(pathToFileURL(path.join(root, 'examples', 'starter', 'talk.js')).href + '?starter-theme=' + Date.now())
  const spec = yaml.load(fs.readFileSync(path.join(root, 'examples', 'starter', 'slides.yaml'), 'utf8'))
  const iframeIndex = spec.slides.findIndex(slide => {
    return Array.isArray(slide.columns) && slide.columns.some(column => column.iframe && column.device === 'iphone')
  })
  const slides = mod.createTalk(spec, talk)

  withFakeBrowser(function () {
    global.window.innerWidth = 390
    global.window.innerHeight = 844
    const target = new FakeElement('section')
    slides[iframeIndex](target)

    const device = findDeep(target, el => String(el.className).includes('ps-iframe-device-iphone'))

    assert(iframeIndex >= 0, 'starter includes an iPhone iframe slide')
    assert(device, 'starter iframe slide renders an iPhone device frame')
    assert.notEqual(device.style.width, 'min(54vh, 30vw, 430px)', 'starter no longer applies the old portrait-hostile 30vw cap')
    assert.equal(device.style.width, 'min(85vw, calc(85vh * 390 / 844), 390px)', 'starter uses the mobile-friendly runtime iPhone width inside columns')
    assert.equal(device.style.aspectRatio, '390 / 844', 'starter phone frame preserves iPhone proportions')
  })
})

test('starter install HTML slide uses scoped terminal UI with copy behavior', function () {
  const source = fs.readFileSync(path.join(root, 'examples', 'starter', 'slides.yaml'), 'utf8')
  const spec = yaml.load(source)
  const slides = spec.slides
  const slide = slides.find(slide => slide.html && slide.html.includes('ps-install-terminal'))

  assert.equal(slides[slides.length - 2].custom, 'particleField', 'starter keeps custom renderer immediately before the final HTML block')
  assert(slides[slides.length - 1].html, 'starter keeps the final HTML block at the bottom')
  assert(source.includes('- html: |\n    <section class="ps-install-terminal">'), 'starter final HTML slide stays as a clean YAML block scalar')
  assert(!source.includes('html: "<section class="ps-install-terminal"'), 'starter final HTML slide is not serialized as a quoted string')
  assert(slide, 'starter includes the install terminal HTML slide')
  assert(!slide.html.includes('starter-install.html'), 'terminal slide omits the browser-window filename label')
  assert(slide.html.includes('Want Interactive Elements?'), 'terminal slide carries the interactive-elements headline')
  assert(slide.html.includes('Your agent can easily inline HTML, CSS, and JS'), 'terminal slide sells inline browser UI in the slide')
  assert(slide.html.includes('Ready to give it a try?'), 'terminal slide tees up the install commands')
  assert(slide.html.includes('class="lede cta"') && slide.html.includes('.ps-install-terminal .lede.cta'), 'terminal slide spaces the CTA line away from the intro copy')
  assert(slide.html.includes('class="talk-name"'), 'terminal slide includes a talk-name input area')
  assert(slide.html.includes('<label for="ps-talk-name">Name Your Talk</label>'), 'terminal slide labels the talk-name input')
  assert(slide.html.includes('value="Best Talk Ever"'), 'terminal slide defaults the talk name with appropriate capitalization')
  assert(!slide.html.includes('Commands use:'), 'terminal slide omits the redundant commands-use helper')
  assert(slide.html.includes('class="command-card"'), 'terminal slide includes a command card')
  assert.equal((slide.html.match(/<span data-command-line>/g) || []).length, 3, 'terminal slide renders three command lines')
  assert(slide.html.includes('npx power-slides init best-talk-ever'), 'terminal slide shows the starter init command')
  assert(slide.html.includes('cd best-talk-ever'), 'terminal slide shows the cd command')
  assert(slide.html.includes('npx power-slides dev .'), 'terminal slide shows the dev command')
  assert(slide.html.includes(".replace(/[^a-z0-9._-]+/g, '-')"), 'terminal slide slugifies unsafe talk-name characters')
  assert(slide.html.includes("return safe || 'best-talk-ever'"), 'terminal slide falls back to best-talk-ever for blank name your talks')
  assert(slide.html.includes('data-copy-command'), 'copy button is marked as the copy-all control')
  assert(slide.html.includes("Array.from(root.querySelectorAll('[data-command-line]'))"), 'copy button gathers all visible command lines')
  assert(slide.html.includes(".join('\\n')"), 'copy button joins commands with newlines')
  assert(slide.html.includes('navigator.clipboard.writeText(commands)'), 'copy button writes the full command sequence to the clipboard')
  assert(slide.html.includes("prompt('Copy Commands', commands)"), 'copy fallback presents the full command sequence')
  assert(slide.html.includes('Copy All'), 'copy button text makes copy-all behavior explicit')
  assert(slide.html.includes("button.textContent = 'Copied!'"), 'copy button gives visible copied feedback')
  assert(slide.html.includes("status.textContent = 'Copied All Commands'"), 'copy status uses visible aria-live feedback')
  assert(slide.html.includes('radial-gradient') && slide.html.includes('box-shadow'), 'terminal slide uses browser-native CSS instead of an image')
  assert(slide.html.includes('clamp('), 'terminal slide uses bounded responsive sizing')
  assert(!slide.html.includes('@media'), 'terminal HTML slide stays responsive without a media-query block')
  assert(slide.notes.join(' ').includes('inline HTML, CSS, and JavaScript'), 'notes explain the slide lives as inline HTML/CSS/JS in slides.yaml')
  assert(slide.notes.join(' ').includes('renders the deck in the browser'), 'notes explain the button works because the deck is browser-rendered')
})

test('starter particle field slide uses intrinsic mobile-readable layout CSS', async function () {
  const mod = await loadPowerSlides()
  const talk = await import(pathToFileURL(path.join(root, 'examples', 'starter', 'talk.js')).href + '?starter-particles=' + Date.now())
  const spec = yaml.load(fs.readFileSync(path.join(root, 'examples', 'starter', 'slides.yaml'), 'utf8'))
  const particleIndex = spec.slides.findIndex(slide => slide.custom === 'particleField')
  const slides = mod.createTalk(spec, talk)

  withFakeBrowser(function () {
    global.window.innerWidth = 390
    global.window.innerHeight = 844
    const target = new FakeElement('section')
    slides[particleIndex](target)

    const root = findDeep(target, el => String(el.className).includes('starter-particle-field'))
    const markup = root && root.innerHTML

    assert(root, 'starter custom particle slide renders the scoped particle-field root')
    assert(markup.includes('class="starter-particle-copy"'), 'starter custom particle slide renders the copy card')
    assert(!markup.includes('@media'), 'particle slide uses intrinsic sizing instead of a mobile media-query wall')
    assert(markup.includes('width: min(43rem, calc(100vw - clamp(2rem, 10vw, 4rem)))'), 'particle copy card fits narrow portrait viewports')
    assert(markup.includes('max-height: calc(100vh'), 'particle copy card is constrained to the viewport')
    assert(markup.includes('overflow: auto'), 'particle copy card can scroll instead of clipping on short screens')
    assert(markup.includes('font-size: clamp(2.35rem, 10vw, 5.4rem)'), 'particle title gets a readable responsive size')
  })
})

test('iphone iframe explicit sizing overrides still win', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    const deviceWidthTarget = new FakeElement('section')
    mod.iframe('https://example.test/app', { device: 'iphone', deviceWidth: '312px' })(deviceWidthTarget)
    const deviceWidthFrame = findDeep(deviceWidthTarget, el => String(el.className).includes('ps-iframe-device-iphone'))

    const frameWidthTarget = new FakeElement('section')
    mod.iframe('https://example.test/app', { device: 'iphone', frameWidth: '320px' })(frameWidthTarget)
    const frameWidthFrame = findDeep(frameWidthTarget, el => String(el.className).includes('ps-iframe-device-iphone'))

    const deviceStyleTarget = new FakeElement('section')
    mod.iframe('https://example.test/app', { device: 'iphone', deviceStyle: { width: '330px' } })(deviceStyleTarget)
    const deviceStyleFrame = findDeep(deviceStyleTarget, el => String(el.className).includes('ps-iframe-device-iphone'))

    assert.equal(deviceWidthFrame.style.width, '312px', 'deviceWidth overrides the default iPhone frame width')
    assert.equal(frameWidthFrame.style.width, '320px', 'frameWidth overrides the default iPhone frame width')
    assert.equal(deviceStyleFrame.style.width, '330px', 'deviceStyle can still override the rendered iPhone frame width')
  })
})

test('column iphone iframe defaults fit stacked portrait mobile layouts', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    global.window.innerWidth = 390
    global.window.innerHeight = 844
    const target = new FakeElement('section')
    mod.columns({
      columns: [
        { title: 'Copy', text: 'Stacked copy' },
        { iframe: 'https://example.test/app', device: 'iphone' }
      ]
    })(target)

    const device = findDeep(target, el => String(el.className).includes('ps-iframe-device-iphone'))

    assert.equal(device.style.width, 'min(85vw, calc(85vh * 390 / 844), 390px)', 'column iPhone frame avoids the old tiny mobile vw cap')
    assert.equal(device.style.aspectRatio, '390 / 844', 'column iPhone frame preserves iPhone proportions')
  })
})

test('column iphone iframe explicit frameWidth override wins over column default', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    const target = new FakeElement('section')
    mod.columns({
      columns: [
        { iframe: 'https://example.test/app', device: 'iphone', frameWidth: '340px' }
      ]
    })(target)

    const device = findDeep(target, el => String(el.className).includes('ps-iframe-device-iphone'))

    assert.equal(device.style.width, '340px', 'column frameWidth overrides the column iPhone frame default')
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

test('top-level deck style applies to slide roots and preserves CSS custom properties', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    const target = new FakeElement('section')
    const slides = mod.createTalk({
      title: 'Styled deck',
      style: {
        fontFamily: 'Inter, sans-serif',
        background: '#222',
        color: 'white',
        '--accent': '#5ffbf1'
      },
      slides: [{ title: 'Styled title' }]
    })

    slides[0](target)
    const root = target.children[0]

    assert.equal(root.style.fontFamily, 'Inter, sans-serif', 'top-level fontFamily applies to the slide root')
    assert.equal(root.style.background, '#222', 'top-level background applies to the slide root')
    assert.equal(root.style.color, 'white', 'top-level color applies to the slide root')
    assert.equal(root.style['--accent'], '#5ffbf1', 'quoted CSS custom property applies through setProperty')
  })
})

test('top-level deck style accepts CSS strings and slide rootStyle wins per slide', async function () {
  const mod = await loadPowerSlides()
  withFakeBrowser(function () {
    const target = new FakeElement('section')
    const slides = mod.createTalk({
      style: 'font-family: Inter, sans-serif; background: #222; color: white; --accent: #5ffbf1',
      slides: [{ title: 'Styled title', rootStyle: { color: 'yellow' } }]
    })

    slides[0](target)
    const root = target.children[0]

    assert.equal(root.style.fontFamily, 'Inter, sans-serif', 'CSS string font-family applies to the slide root')
    assert.equal(root.style.background, '#222', 'CSS string background applies to the slide root')
    assert.equal(root.style.color, 'yellow', 'per-slide rootStyle overrides top-level deck style')
    assert.equal(root.style['--accent'], '#5ffbf1', 'CSS string custom property applies to the slide root')
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
    devicePixelRatio: 1,
    requestAnimationFrame () {},
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
    this._queryMatches = {}
    this.nodeType = tagName === '#text' ? 3 : 1
    this.nodeName = tagName === '#text' ? '#text' : String(tagName).toUpperCase()
    if (tagName === 'iframe') this.contentWindow = createFakeContentWindow()
    if (tagName === 'canvas') this.getContext = () => createFakeCanvasContext()
  }

  appendChild (child) {
    this.children.push(child)
    if (child && typeof child === 'object') child.parentNode = this
    return child
  }

  setAttribute (key, value) {
    this.attributes[key] = value
  }

  querySelector (selector) {
    if (!this._queryMatches[selector]) {
      const tagName = ['canvas', 'h1', 'p'].includes(selector) ? selector : 'div'
      const el = new FakeElement(tagName)
      if (selector.startsWith('.')) el.className = selector.slice(1)
      this._queryMatches[selector] = el
    }
    return this._queryMatches[selector]
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

function createFakeCanvasContext () {
  return {
    setTransform () {},
    clearRect () {},
    fillRect () {},
    beginPath () {},
    arc () {},
    fill () {},
    createRadialGradient () {
      return { addColorStop () {} }
    }
  }
}
