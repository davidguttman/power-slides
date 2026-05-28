const h = require('hyperscript')
const Emitter = require('wildemitter')
const xtend = require('xtend')
const createRemote = require('./remote')

let started

const PowerSlides = (module.exports = {
  title: titleSlide,
  image: imageSlide,
  video: videoSlide,
  layeredTitle: layeredTitleSlide,
  remote: function (opts) {
    if (this.remoteState) return this.remoteState
    this.remoteState = createRemote(this, opts)
    return this.remoteState
  },

  start: function (target, slideNotes, isPresenter, opts) {
    if (started) return
    started = true

    if (isPresenter && typeof isPresenter === 'object') {
      opts = isPresenter
      isPresenter = opts.isPresenter
    }

    opts = opts || {}

    this.isPresenter = isPresenter
    this.target = target
    this.opts = opts

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

    const remoteOpts = opts.remote === true ? {} : (opts.remote || {})
    if (opts.remote || createRemote.hasControllerUrl(remoteOpts)) this.remote(remoteOpts)

    if (window.location.hash === '') {
      window.location.hash = '/1'
    } else {
      this.onHashChange()
    }
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

  onHashChange: function (evt) {
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
        elNote.appendChild(h('p', noteItem))
      })
    }

    const slide = this.slides[n - 1]
    if (slide) {
      if (typeof slide === 'function') return slide(this.elSlide)
      if (typeof slide === 'string') return titleSlide(slide)(this.elSlide)
      this.elSlide.innerHTML = ''
      this.elSlide.appendChild(slide)
    }
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

  onResize: function (evt) {
    this.container.style.width = window.innerWidth + 'px'
    this.container.style.height = window.innerHeight + 'px'
  },

  onTouchend: function (evt) {
    const hPct = evt.layerX / window.innerWidth
    if (hPct < 0.2) return this.prevSlide()
    if (hPct > 0.8) return this.nextSlide()
  },

  createContainer: function () {
    return h('.ps-container', {
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
      'justify-content': 'center',
      'align-items': 'center'
    }

    if (this.isPresenter) style.height = '50%'

    return h('.ps-slide', { style })
  },

  openOptions: function () {
    if (!this.remoteState && this.opts && this.opts.remote) {
      this.remote(this.opts.remote === true ? {} : this.opts.remote)
    }

    if (this.remoteState && this.remoteState.openOptions) return this.remoteState.openOptions()
  },

  createNotes: function () {
    const style = {
      width: '100%',
      height: '50%'
    }

    if (!this.isPresenter) style.display = 'none'

    return h('.ps-notes', { style }, 'notes')
  }
})

Emitter.mixin(PowerSlides)

function layeredTitleSlide (fgContent, bgSlide, opts) {
  opts = opts || { brightness: 0.6 }
  let fgSlide

  // Determine the foreground slide function based on the type of fgContent
  if (typeof fgContent === 'string') {
    fgSlide = titleSlide(fgContent) // Default behavior: treat string as title
  } else if (typeof fgContent === 'function') {
    fgSlide = fgContent // Use the provided function directly
  } else if (fgContent instanceof Element || fgContent instanceof DocumentFragment) {
    // If it's a DOM element or fragment, create a function to append it
    fgSlide = function (el) {
      el.innerHTML = ''
      el.appendChild(fgContent)
    }
  } else {
    // Fallback or error handling if needed, for now, just use titleSlide with stringified content
    console.warn('Unsupported foreground content type for layeredTitleSlide, treating as text:', fgContent)
    fgSlide = titleSlide(String(fgContent))
  }

  const outerOpts = {
    style: {
      position: 'relative',
      width: '100%',
      height: '100%'
    }
  }

  const innerStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    'justify-content': 'center',
    'align-items': 'center'
  }

  const fg = h('div', {
    style: xtend(innerStyle, { 'text-shadow': '3px 3px 5px rgba(0, 0, 0, 0.7)' })
  })
  const bg = h('div', {
    style: xtend(innerStyle, { filter: `brightness(${opts.brightness})` })
  })
  const slide = h('div', outerOpts, [bg, fg])

  return function (el) {
    el.innerHTML = ''
    fgSlide(fg)
    bgSlide(bg)
    el.appendChild(slide)
  }
}

function titleSlide (title, style = { padding: '10%' }) {
  const defaultStyle = { padding: '10%' }
  console.log(style, defaultStyle, xtend(defaultStyle, style))
  return function (el) {
    el.innerHTML = ''

    el.appendChild(h('div', { style: xtend(defaultStyle, style) }, h('h1', title)))
  }
}

function imageSlide (url, method) {
  method = method || 'cover'

  const slide = h('.ps-full-img', {
    style: {
      width: '100%',
      height: '100%',
      background: 'url(' + url + ') no-repeat center center',
      'background-size': method
    }
  })

  const preload = h('img', { src: url, style: { display: 'none' } })
  document.body.appendChild(preload)
  preload.onload = function () {
    document.body.removeChild(preload)
  }

  return function (el) {
    el.innerHTML = ''
    el.appendChild(slide)
  }
}

function videoSlide (url, opts) {
  opts = opts || {}
  opts.size = opts.size || 'contain'

  const video = h('video', {
    src: url,
    controls: opts.controls,
    autoplay: false,
    loop: opts.loop,
    muted: true
  })

  const preload = h('video', {
    src: url,
    autoplay: false,
    style: { display: 'none' }
  })
  document.body.appendChild(preload)
  preload.addEventListener('loadeddata', () =>
    document.body.removeChild(preload)
  )

  let isReady = false
  video.addEventListener('loadeddata', function () {
    isReady = true
  })

  function onReady (cb) {
    if (isReady) return setTimeout(cb, 0)

    setTimeout(onReady, 1000, cb)
  }

  return function (el) {
    el.innerHTML = ''
    video.style.opacity = 0
    el.appendChild(video)

    const arWin = window.innerWidth / window.innerHeight

    onReady(function () {
      let rect = video.getBoundingClientRect()
      const arVid = rect.width / rect.height

      if (opts.size === 'contain') {
        if (arVid < arWin) {
          video.style.height = window.innerHeight + 'px'
        } else {
          video.style.width = window.innerWidth + 'px'
        }
      } else {
        if (arVid >= arWin) {
          video.style.height = window.innerHeight + 'px'
        } else {
          video.style.width = window.innerWidth + 'px'
        }
      }

      rect = video.getBoundingClientRect()

      const margin = (window.innerHeight - rect.height) / 2
      video.style.marginTop = margin + 'px'
      video.style.opacity = 1
      video.currentTime = 0
      video.muted = opts.muted
      video.play()
    })
  }
}
