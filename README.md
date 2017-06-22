# power-slides #

Create powerful slideshows for talks and presentations. Each "slide" is a JS function that can do *anything*.

If you only want a couple features while keeping the full power of JS, this might help you. This will:

* *NEW "Presenter Mode"*: View slide notes on your phone + remote control
* Let you use arrow keys for going forward or back
* Let you jump to any slide by number in the url hash
* Keep the url hash synced with the slide you're on
* Run the slide's function each time you navigate to it

## Example ##

```js
var PS = require('power-slides')

// Starts the show: left/right arrows to go forward/back
PS.start(document.body, [
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

  // there's also a helper for video
  [
    PS.video('/example/spin.mp4', {
      loop: false,
      muted: false,
      controls: false,
      size: 'contain' // or 'cover'
    }),
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
])

```

Edit `example/index.js` and run `npm run example` to try it out in your browser.

## API ##

### PS.start(el, slideFns) ###

This will start the slideshow with the specified element (usually `document.body`) and array of slide functions.

Each item in the array will be text or a "slide helper" like `PS.image` or `PS.video` (explained below), a DOM element, or a function that receives the container element as an argument.

```js
var slideshow = PS.start(document.body, [
  // basic large text
  'power-slides',

  // or your own function
  function (slide) {
    var el = document.createElement('h1')
    el.innerHTML = 'Custom Slide!'

    slide.innerHTML = ''
    slide.appendChild(el)
  }
])
```

### PS.image(url[, backgroundSize]) ###

Standard "big image". By default `backgroundSize` is "cover". Depending on the image you might want to use `"contain"`. For more info see [background-size on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/background-size?redirectlocale=en-US&redirectslug=CSS%2Fbackground-size).

### PS.video(url[, videoOptions]) ###

Standard "big movie". Default options are `{loop: false, muted: false, controls: false, size: 'contain'}`

## License ##

MIT
