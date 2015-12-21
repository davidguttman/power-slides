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

// First create an array of slides
var slides = [
  // A "slide" can simply be text
  'Introducing power-slides',

  // When an array, the first item is the "slide" and the rest are notes
  [ 'I am a Title',
    'This is note only viewable in presenter mode',
    '...and so is this' ],

  // power-slides has a helper for images
  [ PS.image('/example/fist-bump.gif'),
    'By default, the image is full-screen',
    'It does this by using the "cover" background-size method' ],

  [ PS.image('/example/multipass.gif', 'contain'),
    'But you can choose how you would like the image sized',
    'This image is "contained" to preserve the aspect ratio without cropping'],

  // there's also a helper for video
  [ PS.video('/example/spin.mp4', {loop: false, muted: false, controls: false}),
    'By default the video will not loop, show controls, nor be muted',
    '...but that can be changed easily'
  ],

  // if you want to get fancy, pass in a function
  function (slideContainer) {
    // your function will receive the slide container as an argument
    // we'll clear it out and add a "typewriter" effect
    slideContainer.innerHTML = ''

    var el = document.createElement('h1')
    el.style.fontFamily = 'monospace'
    slideContainer.appendChild(el)

    var letters = ('Custom effects!').split('')

    var interval = setInterval(function () {
      var letter = letters.shift()
      if (!letter) return clearInterval(interval)

      el.innerHTML += letter
    }, 250)
  }
]


PS.start(document.body, slides, isPresenter)
