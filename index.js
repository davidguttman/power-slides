var h = require('hyperscript')
var Emitter = require('wildemitter')

var started

var PowerSlides = module.exports = {
  title: titleSlide,
  image: imageSlide,
  video: videoSlide,

  start: function (target, slideNotes, isPresenter) {
    if (started) return
    started = true

    this.isPresenter = isPresenter
    this.target = target

    var slides = this.slides = []
    var notes = this.notes = []

    slideNotes.forEach(function (slideNote, i) {
      if (!Array.isArray(slideNote)) return slides[i] = slideNote

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
    if (slideNumber > this.slides.length - 1) slideNumber = this.slides.length - 1
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
    }
  },

  getCurrentSlideNumber: function () {
    var slideNumberStr = window.location.hash.replace(/^#\/?/, '')
    var slideNumber = parseFloat(slideNumberStr)
    return isFinite(slideNumber) ? slideNumber : 0
  },

  onKeyup: function (evt) {
    if (evt.keyIdentifier === 'Right') return this.nextSlide()
    if (evt.keyIdentifier === 'Left') return this.prevSlide()
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
    return h('.ps-container', { style: {
      width: window.innerWidth + 'px',
      height: window.innerHeight + 'px',
      position: 'absolute',
      top: 0,
      left: 0
    }})
  },

  createSlide: function () {
    var style = {
      'width': '100%',
      'height': '100%',
      'display': 'flex',
      'justify-content': 'center',
      'align-items': 'center'
    }

    if (this.isPresenter) style.height = '50%'

    return h('.ps-slide', {style: style})
  },

  createNotes: function () {
    var style = {
      'width': '100%',
      'height': '50%'
    }

    if (!this.isPresenter) style.display = 'none'

    return h('.ps-notes', {style: style}, 'notes')
  }
}

Emitter.mixin(PowerSlides)

function titleSlide (title) {
  return function (el) {
    el.innerHTML = ''

    el.appendChild(h('div',
      h('h1', title)
    ))
  }
}

function imageSlide (url, method) {
  method = method || 'cover'

  var slide = h('.ps-full-img',
    {
      style: {
        'width': '100%',
        'height': '100%',
        'background': 'url(' + url + ') no-repeat center center',
        'background-size': method
      }
    }
  )

  return function (el) {
    el.innerHTML = ''
    el.appendChild(slide)
  }
}

function videoSlide (url, playAudio) {
  var video = h('video', {
    src: url,
    controls: true,
    autoplay: true,
    muted: !playAudio
  })

  return function (el) {
    el.innerHTML = ''
    video.style.opacity = 0
    el.appendChild(video)

    var arWin = window.innerWidth / window.innerHeight

    video.addEventListener('loadeddata', function () {
      var rect = video.getBoundingClientRect()
      var arVid = rect.width / rect.height

      if (arVid < arWin) {
        video.style.height = window.innerHeight + 'px'
      } else {
        video.style.width = window.innerWidth + 'px'
      }

      rect = video.getBoundingClientRect()

      var margin = (window.innerHeight - rect.height) / 2
      video.style.marginTop = margin + 'px'
      video.style.opacity = 1
    })
  }
}
