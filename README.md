# power-slides #

Create powerful slideshows for talks and presentations. Each "slide" is a JS function that can do *anything*.

If you only want a couple features while keeping the full power of JS, this might help you. This will:

* Let you use arrow keys for going forward or back
* Let you jump to any slide by number in the url hash
* Keep the url hash synced with the slide you're on
* Run the slide's function each time you navigate to it

## Example ##

```js
var PS = require('power-slides')

// Starts the show: left/right arrows to go forward/back
PS.start(document.body, [
  // large text
  PS.title('power-slides'),

  // full-screen image
  PS.image('/example/white-blue.png'),

  // contained image
  PS.image('/example/wide-blue.png', 'contain'),

  // video (muted by default)
  PS.video('/example/spin.mp4'),

  // custom function to alter an element
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
```

Edit `example/index.js` and run `npm run example` to try it out in your browser.

## API ##

### PS.start(el, slideFns) ###

This will start the slideshow with the specified element (usually `document.body`) and array of slide functions.

Each item in the array will be a "slide helper" like `PS.title`, `PS.image`, or `PS.video` (explained below), or it will be a function that receives the element as an argument.

```js
var slideshow = PS.start(document.body, [
  // basic large text using PS.title helper
  PS.title('power-slides'),

  // or your own function
  function (slide) {
    var el = document.createElement('h1')
    el.innerHTML = 'Custom Slide!'

    slide.innerHTML = ''
    slide.appendChild(el)
  }
])
```

### PS.title(text) ###

Standard "big text" card. Will make sure it's centered.

### PS.image(url[, backgroundSize]) ###

Standard "big image". By default `backgroundSize` is "cover". Depending on the image you might want to use `"contain"`. For more info see [background-size on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/background-size?redirectlocale=en-US&redirectslug=CSS%2Fbackground-size).

### PS.video(url[, playAudio]) ###

Standard "big movie". Will be muted by default, but you can set `playAudio` to `true` if you'd like sound.


## License ##

MIT
