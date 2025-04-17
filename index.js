var h = require('hyperscript')
var Emitter = require('wildemitter')
var xtend = require('xtend')

var started

var PowerSlides = (module.exports = {
  title: titleSlide,
  image: imageSlide,
  video: videoSlide,
  layeredTitle: layeredTitleSlide,

  start: function (target, slideNotes, isPresenter) {
    if (started) return
    started = true

    this.isPresenter = isPresenter
    this.target = target

    var slides = (this.slides = [])
    var notes = (this.notes = [])

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
    } else {
      this.onHashChange()
    }
  },

  nextSlide: function () {
    var slideNumber = this.getCurrentSlideNumber()
    if (slideNumber > this.slides.length - 1) {
      slideNumber = this.slides.length - 1
    }
    window.location.hash = '/' + (slideNumber + 1)
  },

  prevSlide: function () {
    var slideNumber = this.getCurrentSlideNumber()
    if (slideNumber < 2) slideNumber = 2
    window.location.hash = '/' + (slideNumber - 1)
  },

  onHashChange: function (evt) {
    var slideNumber = this.getCurrentSlideNumber()
    this.changeSlide(slideNumber)
  },

  changeSlide: function (n) {
    this.emit('changeSlide', n)

    var note = this.notes[n - 1]
    var elNote = this.elNote
    elNote.innerHTML = ''

    if (note && note[0]) {
      note.forEach(function (noteItem) {
        elNote.appendChild(h('p', noteItem))
      })
    }

    var slide = this.slides[n - 1]
    if (slide) {
      if (typeof slide === 'function') return slide(this.elSlide)
      if (typeof slide === 'string') return titleSlide(slide)(this.elSlide)
      this.elSlide.innerHTML = ''
      this.elSlide.appendChild(slide)
    }
  },

  getCurrentSlideNumber: function () {
    var slideNumberStr = window.location.hash.replace(/^#\/?/, '')
    var slideNumber = parseFloat(slideNumberStr)
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

  onResize: function (evt) {
    this.container.style.width = window.innerWidth + 'px'
    this.container.style.height = window.innerHeight + 'px'
  },

  onTouchend: function (evt) {
    var hPct = evt.layerX / window.innerWidth
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
    var style = {
      width: '100%',
      height: '100%',
      display: 'flex',
      'justify-content': 'center',
      'align-items': 'center'
    }

    if (this.isPresenter) style.height = '50%'

    return h('.ps-slide', { style: style })
  },

  createNotes: function () {
    var style = {
      width: '100%',
      height: '50%'
    }

    if (!this.isPresenter) style.display = 'none'

    return h('.ps-notes', { style: style }, 'notes')
  }
})

Emitter.mixin(PowerSlides)

function layeredTitleSlide (fgContent, bgSlide, opts) {
  opts = opts || { brightness: 0.6 }
  var fgSlide

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

  var outerOpts = {
    style: {
      position: 'relative',
      width: '100%',
      height: '100%'
    }
  }

  var innerStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    'justify-content': 'center',
    'align-items': 'center'
  }

  var fg = h('div', {
    style: xtend(innerStyle, { 'text-shadow': '3px 3px 5px rgba(0, 0, 0, 0.7)' })
  })
  var bg = h('div', {
    style: xtend(innerStyle, { filter: `brightness(${opts.brightness})` })
  })
  var slide = h('div', outerOpts, [ bg, fg ])

  return function (el) {
    el.innerHTML = ''
    fgSlide(fg)
    bgSlide(bg)
    el.appendChild(slide)
  }
}

function titleSlide (title, style = { padding: '10%' }) {
  var defaultStyle = { padding: '10%' }
  console.log(style, defaultStyle, xtend(defaultStyle, style))
  return function (el) {
    el.innerHTML = ''

    el.appendChild(h('div', {style: xtend(defaultStyle, style)}, h('h1', title)))
  }
}

function imageSlide (url, method) {
  method = method || 'cover'

  var slide = h('.ps-full-img', {
    style: {
      width: '100%',
      height: '100%',
      background: 'url(' + url + ') no-repeat center center',
      'background-size': method
    }
  })

  var preload = h('img', { src: url, style: { display: 'none' } })
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

  var video = h('video', {
    src: url,
    controls: opts.controls,
    autoplay: false,
    loop: opts.loop,
    muted: true
  })

  var preload = h('video', {
    src: url,
    autoplay: false,
    style: { display: 'none' }
  })
  document.body.appendChild(preload)
  preload.addEventListener('loadeddata', () =>
    document.body.removeChild(preload)
  )

  var isReady = false
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

    var arWin = window.innerWidth / window.innerHeight

    onReady(function () {
      var rect = video.getBoundingClientRect()
      var arVid = rect.width / rect.height

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

      var margin = (window.innerHeight - rect.height) / 2
      video.style.marginTop = margin + 'px'
      video.style.opacity = 1
      video.currentTime = 0
      video.muted = opts.muted
      video.play()
    })
  }
}
