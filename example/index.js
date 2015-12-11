var PS = require('..')

PS.start(document.body, [
  // large text
  PS.title('simple-slides'),

  // full-screen image
  PS.image('/example/white-blue.png'),

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
])
