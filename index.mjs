import createRemote from './remote.js'

let started = false

const listeners = Object.create(null)
const slideNotesKey = Symbol.for('power-slides.notes')

const PowerSlides = {
  title,
  image,
  video,
  layeredTitle,
  remote: function (opts) {
    if (this.remoteState) return this.remoteState
    this.remoteState = createRemote(this, opts)
    return this.remoteState
  },
  text,
  overlay,
  columns,
  quote,
  citation,
  chart,
  summary,
  iframe,
  custom,
  html,
  createTalk,
  renderSlideObject,
  inferSlideType,
  startTalk,
  collectAssets,
  preloadAssets,
  preloadSlideAssets,

  start: function (target, slideNotes, opts) {
    if (started) return this
    started = true

    opts = (opts && typeof opts === 'object') ? opts : {}

    this.target = target
    this.opts = opts

    const slides = (this.slides = [])
    const notes = (this.notes = [])

    slideNotes.forEach(function (slideNote, i) {
      slides[i] = slideNote

      const slideNotes = getSlideNotes(slideNote)
      if (slideNotes) notes[i] = slideNotes
    })

    this.container = this.createContainer()
    this.target.appendChild(this.container)

    this.elSlide = this.createSlide()
    this.container.appendChild(this.elSlide)

    window.addEventListener('hashchange', this.onHashChange.bind(this))
    window.addEventListener('keyup', this.onKeyup.bind(this))
    window.addEventListener('resize', this.onResize.bind(this))
    window.addEventListener('touchend', this.onTouchend.bind(this))

    const remoteOpts = opts.remote === true ? {} : (opts.remote || {})
    if (opts.remote || createRemote.hasControllerUrl(remoteOpts)) this.remote(remoteOpts)

    if (window.location.hash === '') {
      window.location.hash = '/1'
      this.changeSlide(1)
    } else {
      this.onHashChange()
    }

    return this
  },

  nextSlide: function () {
    let slideNumber = this.getCurrentSlideNumber()
    if (slideNumber > this.slides.length - 1) {
      slideNumber = this.slides.length - 1
    }
    window.location.hash = '/' + (slideNumber + 1)
  },

  prevSlide: function () {
    let slideNumber = this.getCurrentSlideNumber()
    if (slideNumber < 2) slideNumber = 2
    window.location.hash = '/' + (slideNumber - 1)
  },

  on: function (name, fn) {
    listeners[name] = listeners[name] || []
    listeners[name].push(fn)
    return this
  },

  off: function (name, fn) {
    if (!listeners[name]) return this
    listeners[name] = listeners[name].filter(listener => listener !== fn)
    return this
  },

  emit: function (name, value) {
    ;(listeners[name] || []).forEach(fn => fn(value))
    return this
  },

  onHashChange: function () {
    const slideNumber = this.getCurrentSlideNumber()
    this.changeSlide(slideNumber)
  },

  changeSlide: function (n) {
    this.emit('changeSlide', n)

    const slide = this.slides[n - 1]
    if (slide) renderSlide(slide, this.elSlide)
  },

  getCurrentSlideNumber: function () {
    const slideNumberStr = window.location.hash.replace(/^#\/?/, '')
    const slideNumber = parseFloat(slideNumberStr)
    return isFinite(slideNumber) ? slideNumber : 0
  },

  onKeyup: function (evt) {
    if (createRemote.isOptionsKey(evt)) return this.openOptions()

    if (evt.keyIdentifier === 'Right' || evt.key === 'ArrowRight') {
      return this.nextSlide()
    }
    if (evt.keyIdentifier === 'Left' || evt.key === 'ArrowLeft') {
      return this.prevSlide()
    }
  },

  onResize: function () {
    this.container.style.width = window.innerWidth + 'px'
    this.container.style.height = window.innerHeight + 'px'
  },

  onTouchend: function (evt) {
    const hPct = evt.layerX / window.innerWidth
    if (hPct < 0.2) return this.prevSlide()
    if (hPct > 0.8) return this.nextSlide()
  },

  createContainer: function () {
    return element('div', {
      className: 'ps-container',
      style: {
        width: window.innerWidth + 'px',
        height: window.innerHeight + 'px',
        position: 'absolute',
        top: 0,
        left: 0
      }
    })
  },

  createSlide: function () {
    const style = {
      width: '100%',
      height: '100%',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }

    return element('div', { className: 'ps-slide', style })
  },

  openOptions: function () {
    if (!this.remoteState && this.opts && this.opts.remote) {
      this.remote(this.opts.remote === true ? {} : this.opts.remote)
    }

    if (this.remoteState && this.remoteState.openOptions) return this.remoteState.openOptions()
  }
}

export default PowerSlides
export const start = PowerSlides.start.bind(PowerSlides)
export const nextSlide = PowerSlides.nextSlide.bind(PowerSlides)
export const prevSlide = PowerSlides.prevSlide.bind(PowerSlides)

function renderSlide (slide, target) {
  if (typeof slide === 'function') return slide(target)
  if (typeof slide === 'string') return title(slide)(target)
  target.innerHTML = ''
  target.appendChild(slide)
}

function element (tag, attrs, children) {
  const el = document.createElement(tag)
  attrs = attrs || {}
  Object.keys(attrs).forEach(function (key) {
    const value = attrs[key]
    if (value == null) return
    if (key === 'style') applyStyle(el.style, value)
    else if (key === 'className') el.className = value
    else if (key in el) el[key] = value
    else el.setAttribute(key, value)
  })
  append(el, children)
  return el
}

export function applyStyle (target, style) {
  const normalized = normalizeStyle(style)
  Object.keys(normalized).forEach(function (key) {
    const value = normalized[key]
    if (value == null) return
    if (key.indexOf('-') !== -1 && typeof target.setProperty === 'function') {
      target.setProperty(key, value)
    } else {
      target[key] = value
    }
  })
  return target
}

export function mergeStyle () {
  const merged = {}
  Array.prototype.forEach.call(arguments, function (style) {
    Object.assign(merged, normalizeStyle(style))
  })
  return merged
}

function normalizeStyle (style) {
  if (!style) return {}
  if (typeof style === 'string') return parseStyleString(style)
  if (typeof style !== 'object' || Array.isArray(style)) return {}
  return style
}

function parseStyleString (style) {
  const parsed = {}
  String(style).split(';').forEach(function (declaration) {
    const index = declaration.indexOf(':')
    if (index === -1) return
    const name = declaration.slice(0, index).trim()
    const value = declaration.slice(index + 1).trim()
    if (!name || !value) return
    parsed[stylePropertyName(name)] = value
  })
  return parsed
}

function stylePropertyName (name) {
  if (name.indexOf('--') === 0) return name
  return name.replace(/-+([a-zA-Z0-9])/g, function (_, char) {
    return char.toUpperCase()
  })
}

function append (el, children) {
  if (children == null) return el
  if (!Array.isArray(children)) children = [children]
  children.forEach(function (child) {
    if (child == null || child === false) return
    if (Array.isArray(child)) return append(el, child)
    if (typeof child === 'string' || typeof child === 'number') {
      el.appendChild(document.createTextNode(String(child)))
      return
    }
    el.appendChild(child)
  })
  return el
}

function slideFromFactory (factory, assets) {
  const slide = function (target) {
    target.innerHTML = ''
    target.appendChild(factory(target))
  }
  slide.assets = compact(assets)
  return slide
}

export function title (text, style) {
  const defaultStyle = { padding: '10%', textAlign: 'center' }
  return slideFromFactory(function () {
    return element('div', { style: mergeStyle(defaultStyle, style) }, element('h1', {}, text))
  })
}

export function image (url, opts) {
  if (typeof opts === 'string') opts = { fit: opts }
  opts = opts || {}
  const fit = opts.fit || opts.size || 'cover'
  return slideFromFactory(function () {
    return element('div', {
      className: 'ps-full-img',
      style: {
        width: '100%',
        height: '100%',
        background: 'url(' + url + ') no-repeat center center',
        backgroundSize: fit
      }
    })
  }, [url])
}

export function video (url, opts) {
  opts = Object.assign({ loop: false, muted: false, controls: false, fit: 'contain' }, opts || {})
  return slideFromFactory(function () {
    return element('video', {
      src: url,
      controls: opts.controls,
      autoplay: opts.autoplay !== false,
      loop: opts.loop,
      muted: opts.muted,
      playsInline: true,
      preload: opts.preload || 'metadata',
      style: {
        width: '100%',
        height: '100%',
        objectFit: opts.fit || opts.size,
        background: '#000'
      }
    })
  }, [url, opts.poster])
}

export function layeredTitle (foreground, background, opts) {
  opts = Object.assign({ brightness: 0.6 }, opts || {})
  const fgSlide = typeof foreground === 'function' ? foreground : title(String(foreground))
  const bgSlide = typeof background === 'function' ? background : image(String(background))
  const assets = [].concat(fgSlide.assets || [], bgSlide.assets || [])

  return slideFromFactory(function () {
    const fg = element('div', { style: layerStyle({ textShadow: '3px 3px 5px rgba(0, 0, 0, 0.7)' }) })
    const bg = element('div', { style: layerStyle({ filter: 'brightness(' + opts.brightness + ')' }) })
    fgSlide(fg)
    bgSlide(bg)
    return element('div', { style: { position: 'relative', width: '100%', height: '100%' } }, [bg, fg])
  }, assets)
}

function layerStyle (extra) {
  return mergeStyle({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  }, extra)
}

export function text (opts) {
  return overlay(opts)
}

export function overlay (opts) {
  opts = Object.assign({ brightness: 0.45, align: 'center', font: defaultFont(), color: '#fff' }, opts || {})
  const bg = opts.background
  return slideFromFactory(function () {
    const root = element('div', { style: rootStyle(opts) })
    if (bg) {
      root.appendChild(element('div', {
        style: {
          position: 'absolute',
          inset: 0,
          backgroundImage: 'url(' + bg + ')',
          backgroundSize: opts.backgroundSize || 'cover',
          backgroundPosition: opts.backgroundPosition || 'center'
        }
      }))
    }
    root.appendChild(element('div', { style: { position: 'absolute', inset: 0, background: 'rgba(0, 0, 0, ' + opts.brightness + ')' } }))
    root.appendChild(element('div', {
      style: {
        position: 'relative',
        zIndex: 1,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: opts.align === 'left' ? 'flex-start' : 'center',
        textAlign: opts.align,
        padding: opts.padding || '7vh 8vw'
      }
    }, [
      opts.eyebrow && element('div', { style: eyebrowStyle(opts) }, opts.eyebrow),
      element('h1', { style: titleStyle(opts) }, opts.title || opts.text || opts.quote || ''),
      opts.subtitle && element('div', { style: subtitleStyle(opts) }, opts.subtitle)
    ]))
    return root
  }, [bg])
}

export function columns (opts) {
  opts = Object.assign({ font: defaultFont(), color: '#fff', brightness: 0.55 }, opts || {})
  const bg = opts.background
  const columnItems = normalizeColumns(opts)
  return slideFromFactory(function () {
    const root = element('div', { style: rootStyle(opts) })
    if (bg) root.appendChild(backgroundLayer(bg, 0.35))
    if (bg) root.appendChild(scrim(opts.brightness))
    const stacked = shouldStackColumns(opts, columnItems.length)
    root.appendChild(element('div', {
      className: 'ps-columns-layout',
      style: {
        position: 'relative',
        zIndex: 1,
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : (opts.gridTemplateColumns || defaultColumnsTemplate(columnItems.length)),
        gridTemplateRows: stacked ? defaultRowsTemplate(columnItems.length) : (opts.rows || opts.gridTemplateRows || 'minmax(0, 1fr)'),
        gap: opts.gap || 'clamp(1.5rem, 3vw, 3.25rem)',
        alignItems: opts.alignItems || 'center',
        justifyItems: opts.justifyItems || 'stretch',
        padding: opts.padding || 'clamp(2rem, 5vh, 4.5rem) clamp(2rem, 5vw, 5rem)'
      }
    }, columnItems.map(function (column, index) {
      return renderColumn(column, opts, index)
    })))
    return root
  }, [bg].concat(collectAssets(columnItems)))
}

export function quote (opts) {
  return citation(opts)
}

export function citation (opts) {
  opts = Object.assign({ font: defaultFont(), color: '#fff', brightness: 0.56, align: 'center' }, opts || {})
  const bg = opts.background
  const attribution = citationAttribution(opts)
  return slideFromFactory(function () {
    const root = element('div', { className: 'ps-citation-slide', style: rootStyle(opts) })
    if (bg) root.appendChild(backgroundLayer(bg, 0.35))
    if (bg) root.appendChild(scrim(opts.brightness))
    root.appendChild(element('figure', {
      className: 'ps-citation-content',
      style: {
        position: 'relative',
        zIndex: 1,
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        margin: 0,
        padding: opts.padding || 'clamp(2.5rem, 8vh, 7rem) clamp(2rem, 9vw, 8rem)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: opts.align === 'left' ? 'flex-start' : 'center',
        textAlign: opts.align,
        fontFamily: opts.font,
        color: opts.color
      }
    }, [
      opts.eyebrow && element('div', { style: eyebrowStyle(opts) }, opts.eyebrow),
      element('blockquote', {
        className: 'ps-citation-quote',
        style: mergeStyle({
          margin: 0,
          maxWidth: opts.maxWidth || 'min(18em, 100%)',
          fontSize: opts.quoteSize || opts.size || 'clamp(2.6rem, 5.8vw, 6.6rem)',
          lineHeight: opts.lineHeight || 1.05,
          fontWeight: opts.quoteWeight || 800,
          letterSpacing: opts.quoteLetterSpacing || '-0.045em',
          whiteSpace: 'pre-line',
          textShadow: '0 3px 14px rgba(0,0,0,0.55)'
        }, opts.quoteStyle)
      }, opts.quote || opts.text || ''),
      attribution && element('figcaption', {
        className: 'ps-citation-attribution',
        style: mergeStyle({
          marginTop: opts.attributionMarginTop || 'clamp(1.2rem, 3vh, 2.4rem)',
          maxWidth: opts.attributionMaxWidth || opts.maxWidth || 'min(42rem, 100%)',
          fontSize: opts.attributionSize || 'clamp(1.1rem, 1.8vw, 1.65rem)',
          lineHeight: 1.35,
          fontWeight: opts.attributionWeight || 700,
          opacity: opts.attributionOpacity == null ? 0.86 : opts.attributionOpacity,
          whiteSpace: 'pre-line',
          textShadow: '0 2px 10px rgba(0,0,0,0.55)'
        }, opts.attributionStyle)
      }, attribution)
    ]))
    return root
  }, [bg])
}

export function chart (opts) {
  opts = opts || {}
  const chartImage = opts.image
  const chartColumns = Array.isArray(opts.columns)
    ? opts.columns
    : [
        { quote: opts.quote || opts.title || '', eyebrow: opts.eyebrow, text: opts.text, bullets: opts.bullets },
        chartImage && { image: chartImage, fit: opts.fit }
      ].filter(Boolean)
  return columns(Object.assign({ size: '3.2vw' }, opts, { columns: chartColumns }))
}

export function summary (opts) {
  opts = Object.assign({ font: defaultFont(), color: '#fff', brightness: 0.6, card: {} }, opts || {})
  const bg = opts.background
  return slideFromFactory(function () {
    const root = element('div', { style: rootStyle(opts) })
    if (bg) root.appendChild(backgroundLayer(bg, 0.3))
    if (bg) root.appendChild(scrim(opts.brightness))
    root.appendChild(element('div', {
      style: {
        position: 'relative',
        zIndex: 1,
        height: '100%',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: '1fr 1.2fr',
        gap: '4vw',
        alignItems: 'center',
        padding: '7vh 7vw'
      }
    }, [
      element('div', {}, [
        opts.eyebrow && element('div', { style: eyebrowStyle(opts) }, opts.eyebrow),
        element('h1', { style: mergeStyle({ fontSize: '3.4vw', lineHeight: 1.1, margin: 0, whiteSpace: 'pre-line' }, opts.titleStyle) }, opts.quote || opts.title || '')
      ]),
      element('div', { style: cardStyle() }, [
        element('div', { style: { color: opts.accent || '#ffcc6a', fontSize: '1.6vw', marginBottom: '2vh' } }, opts.card.title || ''),
        element('ul', { style: { margin: '0 0 2vh 1.2em', padding: 0, fontSize: '1.3vw', lineHeight: 1.45 } }, (opts.card.bullets || []).map(item => element('li', { style: { marginBottom: '1vh' } }, item))),
        opts.card.pull && element('div', { style: { marginTop: '2vh', paddingLeft: '1vw', borderLeft: '0.25vw solid ' + (opts.accent || '#ffcc6a'), fontStyle: 'italic', fontSize: '1.5vw', lineHeight: 1.35 } }, opts.card.pull)
      ])
    ]))
    return root
  }, [bg])
}

export function iframe (url, opts) {
  opts = Object.assign({
    iframeTitle: 'Embedded slide',
    navigationControls: true,
    forwardKeys: true
  }, opts || {})
  const iframeUrl = url || opts.iframe || opts.url

  return slideFromFactory(function (target) {
    const phoneFramed = usesPhoneFrame(opts)
    const phoneLayout = iframePhoneLayout(opts)
    const frame = element('iframe', {
      src: iframeUrl,
      srcdoc: opts.srcdoc,
      title: opts.iframeTitle || opts.title,
      allow: opts.allow || 'fullscreen; autoplay; clipboard-read; clipboard-write',
      allowFullscreen: opts.allowFullscreen !== false,
      loading: opts.loading,
      referrerPolicy: opts.referrerPolicy,
      sandbox: opts.sandbox,
      style: iframeStyle(opts)
    })

    const root = element('div', {
      className: iframeRootClass(phoneFramed, phoneLayout),
      tabIndex: 0,
      style: iframeRootStyle(opts, phoneFramed || phoneLayout)
    }, iframeChrome(frame, opts, phoneLayout))

    root.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape') focusDeck(root, target)
    })

    if (opts.navigationControls !== false) {
      root.appendChild(iframeNavigationControls(opts))
    }

    if (opts.forwardKeys !== false) {
      frame.addEventListener('load', function () {
        forwardIframeKeys(frame, root, target)
      })
    }

    return root
  })
}

function iframeRootClass (phoneFramed, phoneLayout) {
  let className = 'ps-iframe-slide'
  if (phoneFramed) className += ' ps-iframe-slide-framed'
  if (phoneLayout) className += ' ps-iframe-slide-side ps-iframe-layout-' + phoneLayout
  return className
}

function iframeRootStyle (opts, phoneFramed) {
  const stagePadding = opts.stagePadding || opts.rootPadding
  const style = {
    position: 'relative',
    width: '100%',
    height: '100%',
    background: opts.background || '#000',
    overflow: 'hidden',
    outline: 'none'
  }

  if (stagePadding) {
    style.boxSizing = 'border-box'
    style.padding = stagePadding
  }

  if (phoneFramed) {
    style.display = 'flex'
    style.alignItems = 'center'
    style.justifyContent = 'center'
  }

  return style
}

function iframeStyle (opts) {
  return mergeStyle({
    width: '100%',
    height: '100%',
    border: 0,
    background: opts.background || '#000'
  }, opts.iframeStyle)
}

function iframeChrome (frame, opts, phoneLayout) {
  if (!usesPhoneFrame(opts)) return frame
  const device = iphoneFrame(frame, opts)
  if (!phoneLayout) return device
  return phoneSideLayout(device, opts, phoneLayout)
}

function usesPhoneFrame (opts) {
  const frame = opts.frame || opts.device
  return frame === 'phone' || frame === 'iphone'
}

function iphoneFrame (frame, opts) {
  return element('div', {
    className: 'ps-iframe-device ps-iframe-device-iphone',
    style: mergeStyle({
      position: 'relative',
      width: opts.deviceWidth || opts.frameWidth || 'min(42vh, 34vw, 430px)',
      aspectRatio: opts.deviceAspectRatio || '390 / 844',
      boxSizing: 'border-box',
      padding: opts.devicePadding || '1.1vh',
      border: opts.deviceBorder || '1px solid rgba(255,255,255,0.18)',
      borderRadius: opts.deviceRadius || '4.8vh',
      background: opts.deviceBackground || 'linear-gradient(145deg, #3a3d45, #050506 58%, #24272d)',
      boxShadow: opts.deviceShadow || '0 2.5vh 7vh rgba(0,0,0,0.55), inset 0 0 0.35vh rgba(255,255,255,0.2)',
      overflow: 'hidden'
    }, opts.deviceStyle)
  }, element('div', {
    className: 'ps-iframe-device-screen',
    style: {
      width: '100%',
      height: '100%',
      borderRadius: opts.screenRadius || '3.7vh',
      overflow: 'hidden',
      background: opts.screenBackground || opts.background || '#000',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)'
    }
  }, frame))
}

function iframePhoneLayout (opts) {
  if (!usesPhoneFrame(opts) || !hasSideCopy(opts.side)) return null
  const layout = opts.layout || opts.phoneLayout || opts.side.layout
  if (layout === 'phone-left' || layout === 'phone-right') return layout
  if (opts.side.position === 'left' || opts.side.side === 'left') return 'phone-right'
  if (opts.side.position === 'right' || opts.side.side === 'right') return 'phone-left'
  return 'phone-right'
}

function hasSideCopy (side) {
  if (!side || typeof side !== 'object') return false
  return Boolean(side.eyebrow || side.title || side.subtitle || side.body || side.text || side.bullets)
}

function phoneSideLayout (device, opts, layout) {
  const side = iframeSideCopy(opts.side, opts)
  const phoneFirst = layout === 'phone-left'

  return element('div', {
    className: 'ps-iframe-phone-layout ps-iframe-' + layout,
    style: mergeStyle({
      width: opts.layoutWidth || 'min(1160px, 92vw)',
      maxWidth: opts.layoutMaxWidth || '100%',
      height: '100%',
      boxSizing: 'border-box',
      display: 'grid',
      gridTemplateColumns: phoneFirst ? 'auto minmax(18rem, 1fr)' : 'minmax(18rem, 1fr) auto',
      gap: opts.layoutGap || 'clamp(2rem, 5vw, 5rem)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: opts.layoutPadding === undefined ? '6vh 5vw' : opts.layoutPadding
    }, opts.layoutStyle)
  }, phoneFirst ? [device, side] : [side, device])
}

function iframeSideCopy (side, opts) {
  side = side || {}
  const paragraphs = normalizeCopyList(side.body || side.text)
  const bullets = normalizeCopyList(side.bullets)

  return element('div', {
    className: 'ps-iframe-side-copy',
    style: mergeStyle({
      color: side.color || opts.color || '#fff',
      fontFamily: side.font || opts.font || defaultFont(),
      maxWidth: side.maxWidth || '34rem'
    }, side.style)
  }, [
    side.eyebrow && element('div', { className: 'ps-iframe-side-eyebrow', style: iframeSideEyebrowStyle(side) }, side.eyebrow),
    side.title && element('h1', { className: 'ps-iframe-side-title', style: iframeSideTitleStyle(side) }, side.title),
    side.subtitle && element('p', { className: 'ps-iframe-side-subtitle', style: iframeSideSubtitleStyle(side) }, side.subtitle),
    paragraphs.map(text => element('p', { className: 'ps-iframe-side-body', style: iframeSideBodyStyle(side) }, text)),
    bullets.length > 0 && element('ul', { className: 'ps-iframe-side-bullets', style: iframeSideBulletsStyle(side) }, bullets.map(item => element('li', { style: { marginBottom: side.bulletGap || '0.55em' } }, item)))
  ])
}

function normalizeCopyList (value) {
  if (!value) return []
  return Array.isArray(value) ? value.filter(Boolean) : [value]
}

function iframeSideEyebrowStyle (side) {
  return mergeStyle({
    color: side.eyebrowColor || side.accent || 'inherit',
    fontSize: side.eyebrowSize || 'clamp(0.72rem, 1vw, 0.95rem)',
    fontWeight: side.eyebrowWeight || 800,
    letterSpacing: side.eyebrowLetterSpacing || '0.2em',
    textTransform: 'uppercase',
    opacity: side.eyebrowOpacity == null ? 0.88 : side.eyebrowOpacity,
    marginBottom: '1rem'
  }, side.eyebrowStyle)
}

function iframeSideTitleStyle (side) {
  return mergeStyle({
    color: side.titleColor || 'inherit',
    fontSize: 'clamp(2.4rem, 5vw, 4.8rem)',
    fontWeight: side.titleWeight || 900,
    lineHeight: 0.96,
    letterSpacing: side.titleLetterSpacing || '-0.055em',
    margin: '0 0 1rem',
    whiteSpace: 'pre-line'
  }, side.titleStyle)
}

function iframeSideSubtitleStyle (side) {
  return mergeStyle({
    color: side.subtitleColor || 'inherit',
    fontSize: 'clamp(1.1rem, 1.7vw, 1.55rem)',
    fontWeight: side.subtitleWeight || 600,
    lineHeight: 1.35,
    opacity: 0.82,
    margin: '0 0 1.3rem',
    whiteSpace: 'pre-line'
  }, side.subtitleStyle)
}

function iframeSideBodyStyle (side) {
  return mergeStyle({
    color: side.bodyColor || 'inherit',
    fontSize: side.bodySize || 'clamp(1rem, 1.35vw, 1.28rem)',
    lineHeight: 1.5,
    opacity: side.bodyOpacity == null ? 0.76 : side.bodyOpacity,
    margin: '0 0 1rem',
    whiteSpace: 'pre-line'
  }, side.bodyStyle)
}

function iframeSideBulletsStyle (side) {
  return mergeStyle({
    color: side.bulletColor || 'inherit',
    fontSize: side.bulletSize || 'clamp(1rem, 1.25vw, 1.18rem)',
    lineHeight: 1.42,
    opacity: side.bulletOpacity == null ? 0.8 : side.bulletOpacity,
    margin: '1.2rem 0 0 1.15em',
    padding: 0
  }, side.bulletsStyle)
}

function iframeNavigationControls (opts) {
  return element('div', {
    className: 'ps-iframe-nav-controls',
    style: {
      position: 'absolute',
      inset: 0,
      zIndex: 4,
      pointerEvents: 'none'
    }
  }, [
    iframeNavigationButton('prev', '‹', opts),
    iframeNavigationButton('next', '›', opts)
  ])
}

function iframeNavigationButton (direction, label, opts) {
  const previous = direction === 'prev'
  const margin = opts.navControlInset || '1rem'
  const style = {
    position: 'absolute',
    bottom: margin,
    [previous ? 'left' : 'right']: margin,
    width: opts.navControlSize || '2.4rem',
    height: opts.navControlSize || '2.4rem',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '999px',
    background: 'rgba(0,0,0,0.22)',
    color: 'rgba(255,255,255,0.68)',
    font: '400 1.7rem/1 system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    cursor: 'pointer',
    pointerEvents: 'auto',
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    opacity: opts.navControlOpacity == null ? 0.72 : opts.navControlOpacity,
    boxShadow: '0 0.25rem 0.8rem rgba(0,0,0,0.22)'
  }

  return element('button', {
    type: 'button',
    className: 'ps-iframe-nav-control ps-iframe-nav-' + direction,
    ariaLabel: previous ? 'Previous slide' : 'Next slide',
    title: previous ? 'Previous slide' : 'Next slide',
    onclick: function (evt) {
      stopKey(evt || {})
      if (previous) PowerSlides.prevSlide()
      else PowerSlides.nextSlide()
    },
    style
  }, label)
}

function focusDeck (root, target) {
  const focusTarget = root || target || (typeof document !== 'undefined' && document.body)
  if (focusTarget && typeof focusTarget.focus === 'function') focusTarget.focus({ preventScroll: true })
}

function forwardIframeKeys (frame, root, target) {
  let frameWindow
  try {
    frameWindow = frame.contentWindow
    if (!frameWindow || typeof frameWindow.addEventListener !== 'function') return
  } catch (err) {
    return
  }

  try {
    frameWindow.addEventListener('keydown', function (evt) {
      if (evt.key === 'Escape') {
        stopKey(evt)
        focusDeck(root, target)
        return
      }

      if (evt.key === 'ArrowRight') {
        stopKey(evt)
        PowerSlides.nextSlide()
        return
      }

      if (evt.key === 'ArrowLeft') {
        stopKey(evt)
        PowerSlides.prevSlide()
      }
    }, true)
  } catch (err) {
    // Cross-origin iframes cannot be scripted. Parent-level arrow controls remain clickable.
  }
}

function stopKey (evt) {
  if (typeof evt.preventDefault === 'function') evt.preventDefault()
  if (typeof evt.stopPropagation === 'function') evt.stopPropagation()
}

export function custom (renderer, opts) {
  const slide = function (target) {
    target.innerHTML = ''
    return renderer(target, opts || {})
  }
  slide.assets = collectAssets(opts || {})
  return slide
}

export function html (markup, opts) {
  opts = opts || {}
  const slide = function (target) {
    target.innerHTML = opts.trusted === false ? '' : markup
    if (opts.trusted === false) target.textContent = markup
  }
  slide.assets = collectAssets({ html: markup })
  return slide
}

function defaultFont () {
  return "'Futura Medium', 'Helvetica Neue', Helvetica, Arial, sans-serif"
}

function rootStyle (opts) {
  return mergeStyle({
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: opts.backgroundColor || '#000',
    fontFamily: opts.font || defaultFont(),
    color: opts.color || '#fff'
  }, opts.rootStyle)
}

function backgroundLayer (url, opacity) {
  return element('div', {
    style: {
      position: 'absolute',
      inset: 0,
      backgroundImage: 'url(' + url + ')',
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      opacity
    }
  })
}

function scrim (brightness) {
  return element('div', { style: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,' + brightness + ')' } })
}

function eyebrowStyle (opts) {
  return mergeStyle({
    fontSize: opts.eyebrowSize || '1.1vw',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    opacity: 0.85,
    marginBottom: '1.1em',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)'
  }, opts.eyebrowStyle)
}

function titleStyle (opts) {
  return mergeStyle({
    fontSize: '4.8vw',
    lineHeight: 1.02,
    margin: 0,
    maxWidth: opts.maxWidth || '18em',
    whiteSpace: 'pre-line',
    textShadow: '0 3px 14px rgba(0,0,0,0.55)'
  }, opts.titleStyle)
}

function subtitleStyle (opts) {
  return mergeStyle({
    fontSize: '1.8vw',
    opacity: 0.88,
    marginTop: '0.85em',
    maxWidth: opts.subtitleMaxWidth || '22em',
    whiteSpace: 'pre-line',
    textShadow: '0 2px 10px rgba(0,0,0,0.55)'
  }, opts.subtitleStyle)
}

function citationAttribution (opts) {
  if (opts.attribution) return opts.attribution
  const parts = compact([opts.author, opts.cite || opts.source])
  return parts.join(parts.length > 1 ? ', ' : '')
}

function normalizeColumns (opts) {
  if (Array.isArray(opts.columns)) {
    const columns = opts.columns.map(normalizeColumn).filter(Boolean)
    return columns.length ? columns : [{}]
  }

  const columns = []
  const copyColumn = pickColumnCopy(opts)
  const mediaColumn = pickColumnMedia(opts)
  if (copyColumn) columns.push(copyColumn)
  if (mediaColumn) columns.push(mediaColumn)
  return columns.length ? columns : [{}]
}

function normalizeColumn (column) {
  if (column == null || column === false) return null
  if (typeof column === 'string' || typeof column === 'number') return { text: String(column) }
  if (typeof column !== 'object' || Array.isArray(column)) return null
  return column
}

function pickColumnCopy (opts) {
  const copy = {}
  ;['eyebrow', 'title', 'subtitle', 'text', 'quote', 'body', 'copy', 'pull', 'bullets', 'html', 'markup'].forEach(function (key) {
    if (hasOwn(opts, key)) copy[key] = opts[key]
  })
  return Object.keys(copy).length ? copy : null
}

function pickColumnMedia (opts) {
  const img = opts.image
  const iframeUrl = opts.iframe || opts.srcdoc
  if (iframeUrl) return { iframe: opts.iframe, srcdoc: opts.srcdoc }
  if (!img) return null
  return { image: img }
}

function defaultColumnsTemplate (count) {
  count = Math.max(1, count || 1)
  if (count === 1) return 'minmax(0, 1fr)'
  return 'repeat(' + count + ', minmax(0, 1fr))'
}

function defaultRowsTemplate (count) {
  count = Math.max(1, count || 1)
  if (count === 1) return 'minmax(0, 1fr)'
  return 'repeat(' + count + ', minmax(0, 1fr))'
}

function shouldStackColumns (opts, count) {
  if (count < 2) return false
  if (opts.stackColumns === false) return false
  if (opts.stackColumns === true) return true
  if (typeof window === 'undefined') return false
  const width = Number(window.innerWidth) || 0
  const height = Number(window.innerHeight) || 0
  if (!width || !height) return false
  return width < height || width <= 720
}

function renderColumn (column, opts, index) {
  const columnOpts = Object.assign({}, opts, column)
  const img = column.image
  const iframeUrl = column.iframe || column.srcdoc
  const nestedColumns = Array.isArray(column.columns)
  const hasCopy = hasColumnCopy(column)
  const hasMedia = Boolean(img || iframeUrl || nestedColumns)
  const className = 'ps-columns-column ps-columns-column-' + (index + 1) + (hasMedia ? ' has-media' : '') + (hasCopy ? ' has-copy' : '')
  return element('div', { className, style: columnsColumnStyle(columnOpts) }, [
    renderColumnCopy(column, opts, hasMedia),
    renderColumnMedia(column, opts)
  ])
}

function renderColumnMedia (column, opts) {
  const columnOpts = Object.assign({}, opts, column)
  if (Array.isArray(column.columns)) {
    return element('div', { className: 'ps-columns-media ps-columns-nested-media', style: columnsMediaStyle(columnOpts) }, renderNestedColumnSlide(columnOpts))
  }
  if (column.iframe || column.srcdoc) {
    return element('div', { className: 'ps-columns-media ps-columns-iframe-media', style: columnsMediaStyle(columnOpts) }, columnIframe(columnOpts))
  }
  if (column.image) {
    return element('div', { className: 'ps-columns-media ps-columns-image-media', style: columnsMediaStyle(columnOpts) }, element('img', { src: column.image, style: imageContainStyle(columnOpts) }))
  }
  return null
}

function renderNestedColumnSlide (opts) {
  const target = element('div', {
    className: 'ps-columns-nested-slide',
    style: {
      width: '100%',
      height: '100%',
      minWidth: 0,
      minHeight: 0
    }
  })
  columns(opts)(target)
  return target
}

function columnIframe (opts) {
  const iframeBackground = opts.iframeBackground || opts.screenBackground || '#000'
  const frame = element('iframe', {
    src: opts.iframe,
    srcdoc: opts.srcdoc,
    title: opts.iframeTitle || opts.title || 'Embedded column',
    allow: opts.allow || 'fullscreen; autoplay; clipboard-read; clipboard-write',
    allowFullscreen: opts.allowFullscreen !== false,
    loading: opts.loading,
    referrerPolicy: opts.referrerPolicy,
    sandbox: opts.sandbox,
    style: iframeStyle(Object.assign({}, opts, {
      background: iframeBackground,
      iframeStyle: mergeStyle({ borderRadius: opts.iframeRadius || 0 }, opts.iframeStyle)
    }))
  })

  const chrome = usesPhoneFrame(opts)
    ? iphoneFrame(frame, Object.assign({ deviceWidth: 'min(46vh, 30vw, 390px)' }, opts, { background: iframeBackground }))
    : frame

  if (opts.navigationControls === false) return chrome

  return element('div', {
    className: 'ps-columns-iframe-shell',
    style: mergeStyle({
      position: 'relative',
      width: '100%',
      height: '100%',
      minWidth: 0,
      minHeight: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }, opts.iframeShellStyle)
  }, [
    chrome,
    iframeNavigationControls(opts)
  ])
}

function renderColumnCopy (column, opts, hasImage) {
  const columnOpts = Object.assign({}, opts, column)
  const html = column.html || column.markup
  if (html) return element('div', { className: 'ps-columns-copy ps-columns-html', style: columnsCopyStyle(columnOpts, hasImage), innerHTML: html })
  if (!hasColumnCopy(column)) return null
  return element('div', { className: 'ps-columns-copy', style: columnsCopyStyle(columnOpts, hasImage) }, [
    column.eyebrow && element('div', { style: eyebrowStyle(columnOpts) }, column.eyebrow),
    column.title && element('h2', { style: columnsHeadingStyle(columnOpts) }, column.title),
    column.quote && element('blockquote', { style: columnsQuoteStyle(columnOpts) }, column.quote),
    column.subtitle && element('p', { style: columnsTextStyle(columnOpts) }, column.subtitle),
    column.text && element('p', { style: columnsTextStyle(columnOpts) }, column.text),
    column.body && element('p', { style: columnsTextStyle(columnOpts) }, column.body),
    column.copy && element('p', { style: columnsTextStyle(columnOpts) }, column.copy),
    column.pull && element('p', { style: columnsPullStyle(columnOpts) }, column.pull),
    Array.isArray(column.bullets) && element('ul', { style: columnsBulletsStyle(columnOpts) }, column.bullets.map(function (bullet) {
      return element('li', { style: { marginBottom: columnOpts.bulletGap || '0.45em' } }, bullet)
    }))
  ])
}

function hasColumnCopy (column) {
  return hasAnyOwn(column, ['eyebrow', 'title', 'subtitle', 'text', 'quote', 'body', 'copy', 'pull', 'bullets', 'html', 'markup'])
}

function columnsColumnStyle (opts) {
  return mergeStyle({
    boxSizing: 'border-box',
    minWidth: 0,
    minHeight: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: opts.justifyContent || opts.columnJustify || 'center',
    alignItems: opts.alignItemsColumn || opts.columnAlign || 'stretch',
    gap: opts.columnGap || 'clamp(0.8rem, 1.6vw, 1.6rem)'
  }, opts.columnStyle)
}

function columnsHeadingStyle (opts) {
  return mergeStyle({
    fontSize: opts.size || 'clamp(2.2rem, 4.6vw, 5.2rem)',
    lineHeight: opts.lineHeight || 1.05,
    margin: 0,
    whiteSpace: 'pre-line'
  }, opts.titleStyle)
}

function columnsQuoteStyle (opts) {
  return mergeStyle({
    fontSize: opts.quoteSize || opts.size || 'clamp(2.2rem, 4.6vw, 5.2rem)',
    lineHeight: opts.lineHeight || 1.08,
    fontWeight: opts.quoteWeight || 800,
    letterSpacing: opts.quoteLetterSpacing || '-0.035em',
    margin: 0,
    whiteSpace: 'pre-line'
  }, opts.quoteStyle)
}

function columnsTextStyle (opts) {
  return mergeStyle({
    fontSize: opts.textSize || opts.size || 'clamp(1.3rem, 2.2vw, 2.2rem)',
    lineHeight: opts.textLineHeight || 1.28,
    margin: opts.textMargin || '0.45em 0 0',
    whiteSpace: 'pre-line'
  }, opts.textStyle)
}

function columnsPullStyle (opts) {
  return mergeStyle({
    fontSize: opts.pullSize || opts.textSize || 'clamp(1.3rem, 2.2vw, 2.2rem)',
    lineHeight: opts.pullLineHeight || 1.25,
    margin: opts.pullMargin || '0.8em 0 0',
    fontWeight: opts.pullWeight || 800,
    whiteSpace: 'pre-line'
  }, opts.pullStyle)
}

function columnsBulletsStyle (opts) {
  return mergeStyle({
    fontSize: opts.bulletSize || opts.textSize || 'clamp(1.25rem, 2vw, 2rem)',
    lineHeight: opts.bulletLineHeight || 1.35,
    margin: opts.bulletMargin || '0.7em 0 0 1.2em',
    padding: 0
  }, opts.bulletsStyle)
}

function columnsCopyStyle (opts, hasImage) {
  return mergeStyle({
    boxSizing: 'border-box',
    minWidth: 0,
    minHeight: 0,
    maxWidth: opts.copyMaxWidth || (hasImage ? 'min(34rem, 100%)' : 'min(58rem, 100%)'),
    justifySelf: opts.copyJustify || (hasImage ? 'end' : 'center'),
    alignSelf: opts.copyAlignSelf || 'center',
    textAlign: opts.copyAlign || opts.align || (hasImage ? 'left' : 'center')
  }, opts.copyStyle)
}

function columnsMediaStyle (opts) {
  return mergeStyle({
    boxSizing: 'border-box',
    minWidth: 0,
    minHeight: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: opts.imageAlign || 'center',
    justifyContent: opts.imageJustify || 'center',
    justifySelf: opts.imageJustifySelf || 'stretch',
    alignSelf: opts.imageAlignSelf || 'center'
  }, opts.mediaStyle)
}

function imageContainStyle (opts) {
  return mergeStyle({
    display: 'block',
    width: 'auto',
    height: 'auto',
    maxWidth: opts.imageMaxWidth || opts.maxWidth || '100%',
    maxHeight: opts.imageMaxHeight || opts.maxHeight || 'min(82vh, 100%)',
    objectFit: opts.fit || 'contain',
    borderRadius: opts.radius || '0.6vw',
    boxShadow: opts.shadow === false ? '' : '0 1vw 3vw rgba(0,0,0,0.6)'
  }, opts.imageStyle)
}

function cardStyle () {
  return {
    padding: '3vh 3vw',
    border: '1px solid rgba(255,255,255,0.18)',
    borderRadius: '1vw',
    background: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(6px)'
  }
}

export function createTalk (spec, talkModule) {
  const talk = normalizeTalkModule(talkModule)
  const objectSpec = spec && !Array.isArray(spec) && typeof spec === 'object' ? spec : null
  const deckStyle = objectSpec ? objectSpec.style : null
  let slides = Array.isArray(spec) ? spec : ((objectSpec && objectSpec.slides) || [])
  if (typeof talk.slides === 'function') slides = talk.slides(slides, PowerSlides)
  return slides.map(slide => normalizeSlide(slide, talk, deckStyle)).filter(Boolean)
}

function normalizeTalkModule (talkModule) {
  if (!talkModule) return {}
  return talkModule.default || talkModule
}

function normalizeSlide (slide, talk, deckStyle) {
  if (slide == null || slide === false) return null
  if (typeof slide === 'function' || typeof slide === 'string' || isDomNode(slide)) return slide
  if (Array.isArray(slide)) return null

  const rendered = renderSlideObject(applyDeckStyle(slide, deckStyle), talk)
  const notes = hasOwn(slide, 'notes') ? slide.notes : (hasOwn(slide, 'note') ? slide.note : undefined)
  if (notes == null) return rendered
  return attachSlideNotes(rendered, notes)
}

function attachSlideNotes (slide, notes) {
  if (!slide || (typeof slide !== 'function' && typeof slide !== 'object')) return slide

  Object.defineProperty(slide, slideNotesKey, {
    value: Array.isArray(notes) ? notes : [notes],
    configurable: true
  })
  return slide
}

function getSlideNotes (slide) {
  if (!slide || (typeof slide !== 'function' && typeof slide !== 'object')) return undefined
  return slide[slideNotesKey]
}

function isDomNode (value) {
  return typeof Node !== 'undefined' && value instanceof Node
}

function applyDeckStyle (slide, deckStyle) {
  if (!deckStyle || !slide || typeof slide !== 'object' || Array.isArray(slide) || isDomNode(slide)) return slide

  const themed = Object.assign({}, slide)
  themed.rootStyle = mergeStyle(deckStyle, slide.rootStyle)

  if (Array.isArray(slide.columns)) {
    themed.columns = slide.columns.map(column => applyDeckStyle(column, deckStyle))
  }

  return themed
}

export function renderSlideObject (slide, talkModule) {
  const talk = normalizeTalkModule(talkModule)
  if (typeof talk.renderSlide === 'function') {
    const customRendered = talk.renderSlide(slide, PowerSlides)
    if (customRendered) return customRendered
  }

  const renderers = Object.assign({}, talk.renderers || {}, talk.custom || {})
  const explicitRendererKey = slide.renderer || slide.name || slide.kind || slide.custom
  if (explicitRendererKey && typeof renderers[explicitRendererKey] === 'function') {
    const rendered = renderers[explicitRendererKey](slide, PowerSlides)
    if (rendered) return rendered
  }

  const slideType = explicitRendererKey ? 'text' : inferSlideType(slide)
  switch (slideType || 'text') {
    case 'text':
      return text(slide)
    case 'image':
      return image(slide.image, slide)
    case 'video':
      return video(slide.video, slide)
    case 'columns':
      return columns(slide)
    case 'iframe':
      return iframe(slide.iframe, slide)
    case 'html':
      return html(slide.html || '')
    case 'custom':
      return title('Missing custom renderer: ' + (slide.custom || slide.name || slide.kind || 'custom'))
    default:
      return text(slide)
  }
}

export function inferSlideType (slide) {
  if (!slide || typeof slide !== 'object') return 'text'
  if (slide.custom) return 'custom'
  if (slide.renderer || slide.name || slide.kind) return 'text'

  if (looksLikeColumnsSlide(slide)) return 'columns'
  if (hasOwn(slide, 'html')) return 'html'
  if (looksLikeIframeSlide(slide)) return 'iframe'
  if (looksLikeVideoSlide(slide)) return 'video'
  if (looksLikeImageOnlySlide(slide)) return 'image'
  return 'text'
}

const imageOnlyCopyFields = [
  'title',
  'subtitle',
  'eyebrow',
  'text',
  'quote',
  'body',
  'copy',
  'bullets',
  'card',
  'html',
  'markup',
  'srcdoc'
]

function looksLikeIframeSlide (slide) {
  if (hasStringAny(slide, ['iframe'])) return true
  if (hasOwn(slide, 'srcdoc')) return true
  return false
}

function looksLikeVideoSlide (slide) {
  if (hasOwn(slide, 'video')) return true
  return false
}

function looksLikeColumnsSlide (slide) {
  return Array.isArray(slide.columns)
}

function looksLikeImageOnlySlide (slide) {
  return hasStringAny(slide, ['image']) && !hasAnyOwn(slide, imageOnlyCopyFields)
}

function mediaString (slide, keys) {
  return keys.map(key => slide[key]).filter(value => typeof value === 'string' && value)
}

function hasStringAny (slide, keys) {
  return mediaString(slide, keys).length > 0
}

function hasAnyOwn (obj, keys) {
  return keys.some(key => hasOwn(obj, key))
}

function hasOwn (obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key)
}

export function startTalk (target, spec, opts) {
  opts = opts || {}
  const slides = Array.isArray(spec) && (typeof spec[0] === 'function' || typeof spec[0] === 'string')
    ? spec
    : createTalk(spec, opts.talk)
  const deck = PowerSlides.start(target, slides, opts)

  setTimeout(function () {
    preloadSlideAssets(slides, { startIndex: 1 })
  }, 0)

  return deck
}

export function collectAssets (value) {
  const found = []
  walkAssets(value, found)
  return unique(found)
}

function walkAssets (value, found) {
  if (!value) return
  if (typeof value === 'function' && Array.isArray(value.assets)) {
    found.push.apply(found, value.assets)
    return
  }
  if (typeof value === 'string') {
    extractUrls(value).forEach(url => found.push(url))
    return
  }
  if (Array.isArray(value)) return value.forEach(item => walkAssets(item, found))
  if (typeof value !== 'object') return

  Object.keys(value).forEach(function (key) {
    const child = value[key]
    if (/^(iframe|url|image|background|poster|video|qr|chart)$/i.test(key) && typeof child === 'string') found.push(child)
    walkAssets(child, found)
  })
}

function extractUrls (value) {
  const urls = []
  value.replace(/url\(['"]?([^'")]+)['"]?\)/g, function (_, url) {
    urls.push(url)
    return ''
  })
  return urls
}

export function preloadSlideAssets (slides, opts) {
  opts = Object.assign({ startIndex: 1 }, opts || {})
  const rest = slides.slice(opts.startIndex)
  return preloadAssets(collectAssets(rest))
}

export function preloadAssets (urls) {
  if (typeof document === 'undefined') return Promise.resolve([])
  return Promise.all(unique(urls).map(preloadOne).filter(Boolean))
}

const preloadingVideos = new Set()
const preloadingImages = new Set()

function preloadOne (url) {
  if (!url || url.indexOf('#') === 0) return null
  return new Promise(resolve => {
    const clean = String(url).replace(/#.*$/, '')
    if (/\.(mp4|webm|mov)(\?|$)/i.test(clean)) {
      const el = document.createElement('video')
      preloadingVideos.add(el)
      const done = function () {
        preloadingVideos.delete(el)
        resolve(url)
      }
      el.preload = 'auto'
      el.onloadeddata = done
      el.onerror = done
      el.src = url
      if (typeof el.load === 'function') el.load()
      return
    }
    const img = new window.Image()
    preloadingImages.add(img)
    const done = function () {
      preloadingImages.delete(img)
      resolve(url)
    }
    img.onload = done
    img.onerror = done
    img.src = url
  })
}

function compact (values) {
  return (values || []).filter(Boolean)
}

function unique (values) {
  return Array.from(new Set(compact(values)))
}
