var PS = require('..')
var shoe = require('shoe')

var host = 'http://' + window.location.hostname + ':1337'
var stream = shoe(host + '/rc')
var isPresenter = window.navigator.userAgent.match(/iPhone|Android/)

if (isPresenter) {
  PS.on('changeSlide', stream.write.bind(stream))
} else {
  stream.on('data', function (n) { window.location.hash = '/' + n })
}

PS.start(document.body, [
  // large text
  PS.title('simple-slides'),

  // full-screen image
  [PS.image('/example/white-blue.png'),
    'This is a note.',
    'There can be more than one!'
  ],

  // contained image
  PS.image('/example/wide-blue.png', 'contain'),

  // video (muted by default)
  PS.video('/example/spin.mp4'),

  // custom
  function (slide) {
    var el = document.createElement('div')
    slide.innerHTML = ''
    slide.appendChild(el)

    var letters = ('Custom effects!').split('')

    var interval = setInterval(function () {
      var letter = letters.shift()
      if (!letter) return clearInterval(interval)

      el.innerHTML += letter
    }, 250)
  }
], isPresenter)
