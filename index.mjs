let started = false

const listeners = Object.create(null)

const PowerSlides = {
  title,
  image,
  video,
  layeredTitle,
  overlay,
  quote,
  chart,
  summary,
  iframe,
  custom,
  html,
  createTalk,
  renderSlideObject,
  startTalk,
  collectAssets,
  preloadAssets,
  preloadSlideAssets,

  start: function (target, slideNotes, isPresenter) {
    if (started) return this
    started = true

    this.isPresenter = isPresenter
    this.target = target

    const slides = (this.slides = [])
    const notes = (this.notes = [])

    slideNotes.forEach(function (slideNote, i) {
      if (!Array.isArray(slideNote)) return (slides[i] = slideNote)

      slides[i] = slideNote[0]
      notes[i] = slideNote.slice(1)
    })

    this.container = this.createContainer()
    this.target.appendChild(this.container)

    this.elSlide = this.createSlide()
    this.container.appendChild(this.elSlide)

    this.elNote = this.createNotes()
    this.container.appendChild(this.elNote)

    window.addEventListener('hashchange', this.onHashChange.bind(this))
    window.addEventListener('keyup', this.onKeyup.bind(this))
    window.addEventListener('resize', this.onResize.bind(this))
    window.addEventListener('touchend', this.onTouchend.bind(this))

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

    const note = this.notes[n - 1]
    const elNote = this.elNote
    elNote.innerHTML = ''

    if (note && note[0]) {
      note.forEach(function (noteItem) {
        elNote.appendChild(element('p', {}, noteItem))
      })
    }

    const slide = this.slides[n - 1]
    if (slide) renderSlide(slide, this.elSlide)
  },

  getCurrentSlideNumber: function () {
    const slideNumberStr = window.location.hash.replace(/^#\/?/, '')
    const slideNumber = parseFloat(slideNumberStr)
    return isFinite(slideNumber) ? slideNumber : 0
  },

  onKeyup: function (evt) {
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

    if (this.isPresenter) style.height = '50%'

    return element('div', { className: 'ps-slide', style })
  },

  createNotes: function () {
    const style = {
      width: '100%',
      height: '50%'
    }

    if (!this.isPresenter) style.display = 'none'

    return element('div', { className: 'ps-notes', style }, 'notes')
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
    if (key === 'style') Object.assign(el.style, value)
    else if (key === 'className') el.className = value
    else if (key in el) el[key] = value
    else el.setAttribute(key, value)
  })
  append(el, children)
  return el
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
    return element('div', { style: Object.assign({}, defaultStyle, style || {}) }, element('h1', {}, text))
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
  opts = Object.assign({ loop: false, muted: false, controls: false, size: 'contain' }, opts || {})
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
        objectFit: opts.size,
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
  return Object.assign({
    position: 'absolute',
    inset: 0,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center'
  }, extra || {})
}

export function overlay (opts) {
  opts = Object.assign({ brightness: 0.45, align: 'center', font: defaultFont(), color: '#fff' }, opts || {})
  const bg = opts.background || opts.image || opts.src
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
      element('h1', { style: titleStyle(opts) }, opts.title || opts.text || ''),
      opts.subtitle && element('div', { style: subtitleStyle(opts) }, opts.subtitle)
    ]))
    return root
  }, [bg])
}

export function quote (opts) {
  opts = Object.assign({ font: defaultFont(), color: '#fff', brightness: 0.55 }, opts || {})
  const bg = opts.background
  const img = opts.src || opts.img || opts.image
  return slideFromFactory(function () {
    const root = element('div', { style: rootStyle(opts) })
    if (bg) root.appendChild(backgroundLayer(bg, 0.35))
    if (bg) root.appendChild(scrim(opts.brightness))
    root.appendChild(element('div', {
      style: {
        position: 'relative',
        zIndex: 1,
        height: '100%',
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: img ? '1fr 1fr' : '1fr',
        gap: '4vw',
        alignItems: 'center',
        padding: '6vh 6vw'
      }
    }, [
      element('div', {}, [
        opts.eyebrow && element('div', { style: eyebrowStyle(opts) }, opts.eyebrow),
        element('h1', { style: { fontSize: opts.size || '3.6vw', lineHeight: 1.08, margin: 0, whiteSpace: 'pre-line' } }, opts.quote || opts.text || '')
      ]),
      img && element('div', { style: centerStyle() }, element('img', { src: img, style: imageContainStyle(opts) }))
    ]))
    return root
  }, [bg, img])
}

export function chart (opts) {
  return quote(Object.assign({ size: '3.2vw' }, opts, { img: opts.src || opts.img || opts.image }))
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
        element('h1', { style: { fontSize: '3.4vw', lineHeight: 1.1, margin: 0, whiteSpace: 'pre-line' } }, opts.quote || opts.title || '')
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

export function iframe (src, opts) {
  opts = Object.assign({
    title: 'Embedded slide',
    navigationControls: true,
    forwardKeys: true
  }, opts || {})
  const iframeSrc = src || opts.src || opts.url

  return slideFromFactory(function (target) {
    const phoneFramed = usesPhoneFrame(opts)
    const phoneLayout = iframePhoneLayout(opts)
    const frame = element('iframe', {
      src: iframeSrc,
      srcdoc: opts.srcdoc,
      title: opts.title,
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
  return Object.assign({
    width: '100%',
    height: '100%',
    border: 0,
    background: opts.background || '#000'
  }, opts.iframeStyle || {})
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
    style: Object.assign({
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
    }, opts.deviceStyle || {})
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
    style: Object.assign({
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
    }, opts.layoutStyle || {})
  }, phoneFirst ? [device, side] : [side, device])
}

function iframeSideCopy (side, opts) {
  side = side || {}
  const paragraphs = normalizeCopyList(side.body || side.text)
  const bullets = normalizeCopyList(side.bullets)

  return element('div', {
    className: 'ps-iframe-side-copy',
    style: Object.assign({
      color: side.color || opts.color || '#fff',
      fontFamily: side.font || opts.font || defaultFont(),
      maxWidth: side.maxWidth || '34rem'
    }, side.style || {})
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
  return {
    color: side.eyebrowColor || side.accent || 'inherit',
    fontSize: side.eyebrowSize || 'clamp(0.72rem, 1vw, 0.95rem)',
    fontWeight: side.eyebrowWeight || 800,
    letterSpacing: side.eyebrowLetterSpacing || '0.2em',
    textTransform: 'uppercase',
    opacity: side.eyebrowOpacity == null ? 0.88 : side.eyebrowOpacity,
    marginBottom: '1rem'
  }
}

function iframeSideTitleStyle (side) {
  return {
    color: side.titleColor || 'inherit',
    fontSize: side.titleSize || 'clamp(2.4rem, 5vw, 4.8rem)',
    fontWeight: side.titleWeight || 900,
    lineHeight: 0.96,
    letterSpacing: side.titleLetterSpacing || '-0.055em',
    margin: '0 0 1rem',
    whiteSpace: 'pre-line'
  }
}

function iframeSideSubtitleStyle (side) {
  return {
    color: side.subtitleColor || 'inherit',
    fontSize: side.subtitleSize || 'clamp(1.1rem, 1.7vw, 1.55rem)',
    fontWeight: side.subtitleWeight || 600,
    lineHeight: 1.35,
    opacity: side.subtitleOpacity == null ? 0.82 : side.subtitleOpacity,
    margin: '0 0 1.3rem',
    whiteSpace: 'pre-line'
  }
}

function iframeSideBodyStyle (side) {
  return {
    color: side.bodyColor || 'inherit',
    fontSize: side.bodySize || 'clamp(1rem, 1.35vw, 1.28rem)',
    lineHeight: 1.5,
    opacity: side.bodyOpacity == null ? 0.76 : side.bodyOpacity,
    margin: '0 0 1rem',
    whiteSpace: 'pre-line'
  }
}

function iframeSideBulletsStyle (side) {
  return {
    color: side.bulletColor || 'inherit',
    fontSize: side.bulletSize || 'clamp(1rem, 1.25vw, 1.18rem)',
    lineHeight: 1.42,
    opacity: side.bulletOpacity == null ? 0.8 : side.bulletOpacity,
    margin: '1.2rem 0 0 1.15em',
    padding: 0
  }
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
  return {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    background: opts.backgroundColor || '#000',
    fontFamily: opts.font || defaultFont(),
    color: opts.color || '#fff'
  }
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
  return {
    fontSize: opts.eyebrowSize || '1.1vw',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    opacity: 0.85,
    marginBottom: '1.1em',
    textShadow: '0 2px 8px rgba(0,0,0,0.6)'
  }
}

function titleStyle (opts) {
  return {
    fontSize: opts.titleSize || '4.8vw',
    lineHeight: 1.02,
    margin: 0,
    maxWidth: opts.maxWidth || '18em',
    whiteSpace: 'pre-line',
    textShadow: '0 3px 14px rgba(0,0,0,0.55)'
  }
}

function subtitleStyle (opts) {
  return {
    fontSize: opts.subtitleSize || '1.8vw',
    opacity: opts.subtitleOpacity == null ? 0.88 : opts.subtitleOpacity,
    marginTop: '0.85em',
    maxWidth: opts.subtitleMaxWidth || '22em',
    whiteSpace: 'pre-line',
    textShadow: '0 2px 10px rgba(0,0,0,0.55)'
  }
}

function centerStyle () {
  return { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }
}

function imageContainStyle (opts) {
  return {
    maxWidth: '100%',
    maxHeight: opts.maxHeight || '86vh',
    objectFit: opts.fit || 'contain',
    borderRadius: opts.radius || '0.6vw',
    boxShadow: opts.shadow === false ? '' : '0 1vw 3vw rgba(0,0,0,0.6)'
  }
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
  let slides = Array.isArray(spec) ? spec : spec.slides || []
  if (typeof talk.slides === 'function') slides = talk.slides(slides, PowerSlides)
  return slides.map(slide => normalizeSlide(slide, talk)).filter(Boolean)
}

function normalizeTalkModule (talkModule) {
  if (!talkModule) return {}
  return talkModule.default || talkModule
}

function normalizeSlide (slide, talk) {
  if (slide == null || slide === false) return null
  if (typeof slide === 'function' || typeof slide === 'string' || isDomNode(slide)) return slide
  if (Array.isArray(slide)) {
    const rendered = normalizeSlide(slide[0], talk)
    return [rendered].concat(slide.slice(1))
  }

  const rendered = renderSlideObject(slide, talk)
  const notes = slide.notes || slide.note
  if (!notes) return rendered
  return [rendered].concat(Array.isArray(notes) ? notes : [notes])
}

function isDomNode (value) {
  return typeof Node !== 'undefined' && value instanceof Node
}

export function renderSlideObject (slide, talkModule) {
  const talk = normalizeTalkModule(talkModule)
  if (typeof talk.renderSlide === 'function') {
    const customRendered = talk.renderSlide(slide, PowerSlides)
    if (customRendered) return customRendered
  }

  const renderers = Object.assign({}, talk.renderers || {}, talk.custom || {})
  const rendererKey = slide.renderer || slide.name || slide.kind || slide.type
  if (rendererKey && typeof renderers[rendererKey] === 'function') {
    const rendered = renderers[rendererKey](slide, PowerSlides)
    if (rendered) return rendered
  }

  switch (slide.type || 'overlay') {
    case 'title':
      return title(slide.title || slide.text || slide.quote || '', slide.style)
    case 'overlay':
      return overlay(slide)
    case 'image':
      return image(slide.src || slide.img || slide.image || slide.background, slide)
    case 'video':
      return video(slide.src || slide.video, slide)
    case 'quote':
      return quote(slide)
    case 'chart':
      return chart(slide)
    case 'summary':
      return summary(slide)
    case 'iframe':
      return iframe(slide.src || slide.url, slide)
    case 'html':
      return html(slide.html || slide.markup || '')
    case 'custom':
      return title('Missing custom renderer: ' + (slide.name || slide.kind || 'custom'))
    default:
      return overlay(slide)
  }
}

export function startTalk (target, spec, opts) {
  opts = opts || {}
  const slides = Array.isArray(spec) && (typeof spec[0] === 'function' || Array.isArray(spec[0]) || typeof spec[0] === 'string')
    ? spec
    : createTalk(spec, opts.talk)
  const deck = PowerSlides.start(target, slides, opts.isPresenter)

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
    if (/^(src|url|image|img|background|poster|video|qr|chart)$/i.test(key) && typeof child === 'string') found.push(child)
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

function preloadOne (url) {
  if (!url || url.indexOf('#') === 0) return null
  return new Promise(resolve => {
    const clean = String(url).replace(/#.*$/, '')
    if (/\.(mp4|webm|mov)(\?|$)/i.test(clean)) {
      const el = document.createElement('video')
      el.preload = 'auto'
      el.src = url
      el.onloadeddata = function () { resolve(url) }
      el.onerror = function () { resolve(url) }
      return
    }
    const img = new window.Image()
    img.onload = function () { resolve(url) }
    img.onerror = function () { resolve(url) }
    img.src = url
  })
}

function compact (values) {
  return (values || []).filter(Boolean)
}

function unique (values) {
  return Array.from(new Set(compact(values)))
}
