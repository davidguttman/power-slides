# power-slides

> Slides that are just JavaScript. Each slide is a function — so it can do *anything*.

`power-slides` is a tiny (~300 LOC), dependency-light slideshow library for people who would rather write a presentation in JS than fight a WYSIWYG. You get the few things you actually want from a slide deck — arrow-key nav, deep-linkable slides, presenter notes — and the full power of the browser for everything else.

```js
const PS = require('power-slides')

PS.start(document.body, [
  'Hello, world',
  PS.image('/cat.gif'),
  function (slide) {
    slide.innerHTML = '<h1>Anything you can do in JS, you can do on a slide.</h1>'
  }
])
```

---

## Why power-slides?

- **A slide is a function.** Want a typewriter effect, a live D3 chart, a WebGL toy, a fetch from your own API? Just write it.
- **Tiny surface area.** Five things to learn: `start`, `image`, `video`, `title`, `layeredTitle`.
- **Keyboard + touch nav out of the box.** Left/right arrows, tap the edges on mobile.
- **Deep links.** Every slide has a URL hash (`#/7`). Reload, share, jump.
- **Presenter mode.** Split view with your speaker notes underneath the slide.
- **No framework, no build opinions.** It's just CommonJS + DOM. Bundle it however you want.

---

## Install

```bash
npm install power-slides
```

You'll want a bundler (browserify, esbuild, webpack, vite, etc.) because the package uses CommonJS `require` and is meant for the browser.

---

## Quickstart

Create an `index.js`:

```js
const PS = require('power-slides')

document.body.style.cssText = `
  background: black;
  color: white;
  font-family: monospace;
  font-size: 2vw;
`

PS.start(document.body, [
  'Introducing power-slides',

  // [slide, ...notes] — notes show in presenter mode
  ['I am a Title',
    'This note is only visible in presenter mode',
    '...and so is this'],

  // image helper, full-bleed by default
  PS.image('/cat.gif'),

  // video helper
  PS.video('/clip.mp4', { loop: true, muted: true }),

  // title layered over an image
  PS.layeredTitle('Big Idea', PS.image('/background.jpg'), { brightness: 0.5 }),

  // anything else — just a function
  function (slide) {
    slide.innerHTML = '<h1 style="font-family: monospace">Custom effects!</h1>'
  }
])
```

Bundle it and open it in a browser. Use the arrow keys to navigate.

### Try the included example

```bash
git clone https://github.com/davidguttman/power-slides.git
cd power-slides
npm install
npm run example
```

This runs [`budo`](https://github.com/mattdesl/budo) on port `9966` and opens the example deck in your browser. Edit `example/index.js` and the page live-reloads.

---

## API

### `PS.start(el, slides, [isPresenter])`

Mounts the slideshow into `el` (usually `document.body`).

- `el` — DOM element to render into.
- `slides` — array. Each entry is one of:
  - a **string** → rendered as a big title slide
  - a **DOM element** → appended into the slide container
  - a **function** `(slideContainer) => void` → called every time you navigate to the slide; you own the DOM
  - an **array** `[slide, ...notes]` → first item is any of the above; remaining items are presenter notes (strings)
- `isPresenter` — optional boolean. When truthy, splits the view so the slide takes the top half and notes appear underneath. A common pattern is to flip it on based on user agent (`/iPhone|Android/`) so your phone becomes the notes screen.

The returned `PowerSlides` object is also an event emitter:

```js
PS.on('changeSlide', n => console.log('now on slide', n))
```

### `PS.image(url, [backgroundSize])`

Full-bleed image slide. `backgroundSize` defaults to `"cover"`. Use `"contain"` if you want the whole image visible without cropping. See [`background-size` on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/background-size).

### `PS.video(url, [options])`

Full-bleed video slide. Default options: `{ loop: false, muted: false, controls: false, size: 'contain' }`. `size` can be `'contain'` or `'cover'`. The video resets and plays each time you navigate to the slide.

### `PS.title(text, [style])`

A plain centered title slide. Useful as the foreground of `layeredTitle` when you want custom styling:

```js
PS.title('Hello', { color: 'white', fontSize: '5vw' })
```

### `PS.layeredTitle(foreground, background, [options])`

Stacks a title on top of another slide (typically an image or video).

- `foreground` — a string, a DOM element, or a slide function (e.g. `PS.title(...)`).
- `background` — any slide function, but usually `PS.image(...)` or `PS.video(...)`.
- `options.brightness` — multiplies the background brightness (default `0.6`). Lower = darker = title more readable.

```js
PS.layeredTitle(
  'Title Over Image',
  PS.image('/bg.jpg'),
  { brightness: 0.5 }
)
```

### Navigation

- `PS.nextSlide()` / `PS.prevSlide()` — programmatic nav.
- Arrow keys — left/right.
- Touch — tap the left 20% / right 20% of the screen.
- URL hash — `#/3` jumps to slide 3, and the hash updates as you navigate.

---

## Patterns

**Live demos.** A slide is a function, so plug in anything: a sandboxed iframe, a CodeMirror editor, a WebSocket-driven dashboard. Whatever runs in a browser tab runs on a slide.

**Reactive slides.** Subscribe to `changeSlide` to pause videos, stop timers, or trigger analytics when the audience moves on.

**Presenter mode on your phone.** Open the deck on your laptop normally, and again on your phone (sniff the UA, like the example does, to flip on `isPresenter`). Use the phone as your notes screen.

---

## Development

```bash
npm install
npm run example   # live-reloading example deck
npm test          # standard linting
```

PRs welcome. The whole library is a single `index.js`.

---

## License

MIT © David Guttman
