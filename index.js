var h = require('hyperscript')

var started

module.exports = {
  title: titleSlide,
  image: imageSlide,
  video: videoSlide,

  start: function (el, slides) {
    if (started) return
    started = true
    this.el = el
    this.slides = slides || []

    window.addEventListener('hashchange', this.onHashChange.bind(this))
    window.addEventListener('keyup', this.onKeyup.bind(this))

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
    if (this.slides[n - 1]) {
      this.slides[n - 1](this.el)
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
  }

}

function titleSlide (title) {
  return function (el) {
    el.innerHTML = ''

    var div = h('div',
      h('h1', title)
    )

    el.appendChild(div)
    var rect = div.getBoundingClientRect()
    div.style.marginTop = (window.innerHeight - rect.height) / 2 - rect.height / 2 + 'px'
  }
}

function imageSlide (url, method) {
  method = method || 'cover'

  var slide = h('.full-img',
    {
      style: {
        'width': window.innerWidth + 'px',
        'height': window.innerHeight + 'px',
        'background': 'url(' + url + ') no-repeat center center fixed',
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
