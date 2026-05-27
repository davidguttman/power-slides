# power-slides

ESM-first reusable talk kit for browser slide decks, with the original tiny JavaScript slideshow runtime still available for custom decks.

`power-slides` lets new talks stay content-only: `slides.yaml` (or JSON), optional `talk.js`, and assets. The package owns the shared HTML shell, Browserify + Terser build, budo dev wiring, slide helpers, and background preloading. If you want to author directly in JS, a slide can still be a function that does *anything* the browser can do.

## Why power-slides?

- **Content-first talks.** Start with `slides.yaml` (or JSON); add `talk.js` only when JavaScript earns its keep.
- **A slide can still be a function.** Want a typewriter effect, a live D3 chart, a WebGL toy, a fetch from your own API? Just write it.
- **Tiny slide-authoring surface area.** Keep normal slides as data; use `talk.js` only for custom effects.
- **Keyboard + touch nav out of the box.** Left/right arrows, tap the edges on mobile.
- **Deep links.** Every slide has a URL hash (`#/7`). Reload, share, jump.
- **Presenter mode.** Split view with your speaker notes underneath the slide.

---

## Install

```bash
npm install power-slides
```

## Create a talk

```bash
power-slides init my-talk
cd my-talk
power-slides dev .      # starts budo; do not use for CI
power-slides build .    # writes public/index.html + cache-busted bundle
```

`power-slides dev .` uses the port from `--port <port>`, then `$PORT`, then `9966`.

`init` creates a content-only talk folder with starter files:

- `slides.yaml` — content and notes
- `talk.js` — optional ESM custom renderers / escape hatch
- `public/` — files served at `/` (videos, generated images, fonts)
- `assets/` — source assets not served directly
- `README.md` — talk-local authoring notes

It refuses to run in a non-empty directory unless you pass `--force`, and it does not overwrite existing files. It does **not** copy a `package.json`, lockfile, or `node_modules` into the talk.

## ESM runtime

```js
import PowerSlides, { overlay, image, startTalk } from 'power-slides'

startTalk(document.body, {
  slides: [
    { type: 'overlay', title: 'Hello', subtitle: 'Reusable talks' },
    { type: 'image', src: '/diagram.png', fit: 'contain' }
  ]
})
```

CommonJS `require('power-slides')` remains available for older decks, but new talks should use ESM and/or the CLI-generated entry.

## slides.yaml

A talk is an object with a `slides` array. The title slide is just the first slide:

```yaml
slides:
  - type: overlay
    eyebrow: David Guttman
    title: My Talk
    subtitle: Optional subtitle
    background: /generated/title.png
    brightness: 0.5
  - type: overlay
    title: Agents need the web
    subtitle: The useful work happens inside real websites.
    notes:
      - Presenter note.
  - type: quote
    quote: A slide can still be anything the browser can render.
    image: https://placehold.co/900x600/png?text=remote
  - type: iframe
    src: https://example.com/demo
    device: iphone
    layout: phone-right
    side:
      title: Demo in context
      bullets:
        - Live site
        - Parent slide copy
  - type: custom
    name: demo
```

YAML is an authoring convenience: the CLI parses `slides.yaml`/`slides.yml` into the same JavaScript object it gets from `slides.json`. JSON is still supported as a format choice. Without `--slides`, the CLI uses the first file it finds in this order: `slides.yaml`, `slides.yml`, then `slides.json`. Use `--slides <file>` to choose a different supported spec.

Built-in slide types for this first reusable slice: `overlay`, `title`, `image`, `video`, `quote`, `chart`, `summary`, `iframe`, `html`, and `custom`.

### Iframe slides

Iframe slides accept normal `src` URLs for external embeds or `srcdoc` markup for local demos. Use `device: "iphone"` or `frame: "phone"` when a mobile website/demo should sit inside a clean rounded phone-like frame. The frame does not draw a fake notch or speaker over the page.

For talk slides where the phone needs explanation beside it, add `layout: "phone-right"` or `layout: "phone-left"` plus a `side` copy object. The layout name says where the phone goes; the side copy stays on the parent slide, outside the iframe/device component. `side` supports `eyebrow`, `title`, `subtitle`, `body`/`text`, and `bullets`.

Iframe slides render subtle parent-level left/right arrow controls by default. They sit above the iframe so cross-origin embeds cannot swallow basic deck navigation. Disable them with `navigationControls: false` when a slide provides its own parent-page controls. Same-origin/`srcdoc` frames may also forward `ArrowLeft`/`ArrowRight` and let `Escape` return focus, but treat that as a best-effort demo enhancement rather than the external-embed guarantee.

```json
{
  "type": "iframe",
  "src": "https://example.com/embedded-demo",
  "device": "iphone",
  "layout": "phone-right",
  "side": {
    "eyebrow": "Live demo",
    "title": "A real app in the deck",
    "subtitle": "The page runs in the phone; the slide carries the story.",
    "bullets": [
      "Cross-origin iframe stays untouched",
      "Parent arrows remain available"
    ]
  }
}
```

## Optional talk.js

`talk.js` is ESM. Export custom renderers when YAML is not enough:

```js
export default {
  renderers: {
    demo (slide, PS) {
      return PS.overlay({
        title: slide.title || 'Live demo',
        subtitle: 'Custom renderer from talk.js'
      })
    }
  }
}
```

The build exposes the package as `power-slides`, so advanced `talk.js` files may also import helpers directly.

## Preloading behavior

`startTalk()` renders slide 1 immediately. After that first render, it scans the remaining slide specs/functions for image/video assets and preloads them in the background, including remote/CDN URLs. This avoids “pop-in” on later slides without blocking the first slide.

Helpers attach `slide.assets` automatically; custom renderers can do the same:

```js
const slide = (el) => { /* render */ }
slide.assets = ['https://cdn.example.com/background.png']
export default { renderers: { custom: () => slide } }
```

## Legacy CommonJS API

Older decks can still use the original CommonJS shape:

```js
const PS = require('power-slides')

PS.start(document.body, [
  'Hello, world',
  PS.image('/cat.gif'),
  PS.video('/clip.mp4'),
  function (slide) {
    slide.innerHTML = '<h1>Anything you can do in JS, you can do on a slide.</h1>'
  }
])
```

Bundle it and open it in a browser. Use the arrow keys to navigate.

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
npm test          # standard linting + CLI smoke tests
npm run build    # builds the bundled example; no long-lived server
npm run example  # live-reloading example deck; starts budo
```

PRs welcome. The core runtime stays small while the reusable talk shell keeps talks content-only.

## License

MIT © David Guttman
