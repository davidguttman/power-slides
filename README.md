# power-slides

Write slideshows in YAML or JavaScript instead of fighting a WYSIWYG.

```yaml
- title: Hello, world
  subtitle: A talk that's just a file
  background: /hero.png
- image: /diagram.png
- title: A slide can still be anything the browser can render.
  subtitle: power-slides
```

```bash
power-slides dev .
```

That's a talk. Arrow keys to navigate, deep links per slide, presenter notes on your phone, optional remote control. When YAML stops being enough — typewriter effect, live D3 visualization, WebGL toy, fetch from your own API — a slide is just a JS function that owns its DOM. Do whatever the browser can do.

## Why power-slides?

- **Content-first.** A talk is `slides.yaml` (or JSON) plus assets. Add `talk.js` only when JS earns its keep.
- **A slide can still be a function.** Full power of the browser, per slide.
- **Keyboard + touch nav out of the box.** Arrows, tap-edges on mobile.
- **Deep links.** Every slide has a URL hash (`#/7`). Reload, share, jump.
- **Presenter mode.** Split view with speaker notes underneath.
- **Remote control.** Drive the deck from your phone over PeerJS — built into the shell, no per-talk wiring.
- **Background preloading.** First slide renders immediately; later images/videos load while you talk.

## Install

```bash
npm install -g power-slides
power-slides init my-talk
```

The package ships a CLI (`power-slides`), an ESM runtime, and a CommonJS runtime for older decks.

## Quickstart — YAML + CLI

```bash
power-slides init my-talk
cd my-talk
npm install
npm run dev      # starts budo; runners such as jump.sh can use npm start
npm run build    # writes public/index.html + cache-busted bundle
```

The generated `package.json` is intentionally minimal and runner-friendly:

```json
{
  "private": true,
  "scripts": {
    "dev": "powerslides dev .",
    "build": "powerslides build .",
    "start": "npm run dev"
  },
  "devDependencies": {
    "power-slides": "^3.0.0"
  }
}
```

`power-slides dev .` / `powerslides dev .` picks its port from `--port <port>`, then `$PORT`, then `9966`. The CLI dev/build shell turns on the built-in Options panel and loads a bundled PeerJS runtime before the deck. Press `o` to reopen Options, then click **Enable remote control** to show the QR code / URL. Export `remote: false` from `talk.js` to disable it, or `remote: { ... }` for PeerJS/options overrides.

`init` creates a talk folder by generating the local `package.json` and copying the packaged minimal `example/` starter authoring files:

- `package.json` — local npm scripts plus a dev dependency on the published `power-slides` package
- `slides.yaml` — seven starter slides: default text, image, video, columns, iframe, html, and custom
- `talk.js` — commented optional ESM hooks; no custom animated slides in the starter
- `public/` — files served at `/`, including the starter `sample.svg` image and `fractal-loop.mp4` video assets
- `assets/` — source assets not served directly
- `README.md` — talk-local authoring notes

It refuses to run in a non-empty directory unless you pass `--force`, and it does not overwrite existing files. It copies only the minimal starter media, not the richer animated showcase assets. See `examples/showcase/` for custom renderers and animated slides. It does **not** copy a lockfile, `node_modules`, generated bundles, or `public/index.html` into the talk.

## Quickstart — ESM

```js
import PowerSlides, { text, image, startTalk } from 'power-slides'

startTalk(document.body, [
  { title: 'Hello', subtitle: 'Reusable talks' },
  { image: '/diagram.png', fit: 'contain' }
])
```

CommonJS `require('power-slides')` still works for older decks, but new talks should use ESM and/or the CLI-generated entry.

## slides.yaml

`docs/slide-api-v3.md` is the canonical v3 slide spec. A slide spec is a bare YAML or JSON array of slides — no top-level `slides:` wrapper and no talk metadata mixed into the content file. The title slide is just the first slide.

Without `--slides`, the CLI picks `slides.yaml`, then `slides.yml`, then `slides.json`.

```yaml
- title: Main point
  subtitle: Optional subtitle
  background: /sample.svg
  brightness: 0.45
  align: center

- image: /sample.svg
  fit: contain

- video: /fractal-loop.mp4
  controls: true
  muted: true
  loop: true
  fit: contain

- background: /sample.svg
  brightness: 0.55
  columns:
    - iframe: https://david.app
      device: iphone
    - title: Demo in context
      bullets:
        - Cross-origin page stays untouched
        - Parent arrows remain available

- iframe: https://david.app
  device: iphone
  background: '#061018'

- html: |
    <div style="width:100vw;height:100vh;color:white">
      <h1>Custom HTML</h1>
    </div>

- custom: particleField
  title: Generative canvas
```

### v3 slide model

Every slide object has exactly one content property:

- `title` — words on screen; unlocks `subtitle`, `eyebrow`, `bullets`, and `pullquote`
- `image` — unlocks `fit`
- `video` — unlocks `fit`, `controls`, `muted`, and `loop`
- `iframe` — unlocks `device`
- `html` — trusted inline markup
- `custom` — delegates to a `talk.js` renderer; any other properties pass through untouched
- `columns` — the only container; each column is itself a slide object, including nested `columns`

Shared properties available on any slide are `background`, `brightness`, and `align`. Use `columns` when you want to combine content types, such as iframe-plus-copy or image-plus-title. On narrow/portrait viewports, columns stack vertically in source order.

The runtime still tolerates some older helper fields and explicit `type` values for existing decks, but public examples and new docs should use the content-property model above.

### Slide concept reference

#### `title`

```yaml
- eyebrow: Section
  title: Write content. Reuse the app.
  subtitle: Optional subtitle copy
  background: /hero.png
  brightness: 0.45
  align: left
```

```yaml
- title: What changed
  bullets:
    - YAML stays content-first
    - JS handles special moments
  pullquote: Build static files to share.
```

#### `image`

```yaml
- image: /diagram.png
  fit: contain
```

#### `video`

```yaml
- video: /fractal-loop.mp4
  controls: true
  muted: true
  loop: true
  fit: contain
```

#### `columns`

```yaml
- background: /generated/chaser-app.png
  brightness: 0.55
  columns:
    - iframe: https://david.app
      device: iphone
    - title: Demo in context
      bullets:
        - Cross-origin page stays untouched
        - Parent arrows remain available
```

```yaml
- background: /bg.png
  columns:
    - eyebrow: Recap
      title: Ship talks, not boilerplate
    - title: What changed
      bullets:
        - YAML stays content-first
        - JS handles special moments
      pullquote: Build static files to share.
```

#### `iframe`

```yaml
- iframe: https://david.app
  device: iphone
  background: '#061018'
```

#### `html`

```yaml
- html: '<main style="padding:8vw;color:white"><h1>Raw HTML</h1></main>'
```

Treat `html` as trusted content; do not put untrusted user input here.

#### `custom`

```yaml
- custom: particleField
  title: Generative canvas
```

Any extra fields are passed through to the renderer.

## Optional talk.js

`talk.js` is ESM. Export custom renderers when YAML is not enough:

```js
export default {
  renderers: {
    demo (slide, PS) {
      return PS.text({
        title: slide.title || 'Live demo',
        subtitle: 'Custom renderer from talk.js'
      })
    }
  }
}
```

`talk.js` may export these hooks:

- `renderers` — map renderer names to `(slide, PS) => slideFunction`. `PS` is the power-slides helper object.
- `custom` — alias map for renderers.
- `renderSlide(slide, PS)` — optional catch-all; return a rendered slide to override normal dispatch, or return nothing to continue.
- `slides(slides, PS)` — transform/theme the parsed slide array before rendering.
- `bodyStyle` — CSS text applied to `document.body` by the CLI entry.
- `beforeStart(PS, spec)` — setup hook called by the CLI entry just before `startTalk()`.

Renderer return values can be slide functions, DOM nodes, or strings. The build exposes the package as `power-slides`, so advanced `talk.js` files may also import helpers directly.

## Asset loading

The first slide renders immediately. After that, power-slides starts loading image/video assets referenced by later slides — including remote URLs — so the deck feels smoother without blocking the first paint. Helpers attach `slide.assets` automatically; custom renderers can do the same:

```js
const slide = (el) => { /* render */ }
slide.assets = ['https://cdn.example.com/background.png']
export default { renderers: { custom: () => slide } }
```

## API

### `startTalk(el, slidesOrSpec, [options])`

ESM entry point. Renders a v3 slide array (or a legacy object with `slides`) into `el`. The ESM `PowerSlides` object has all data-driven helpers (`text`, `image`, `video`, `columns`, `iframe`, `html`, …) attached.

### `PS.start(el, slides, [isPresenter], [options])`

Original hand-rolled API. Each entry in `slides` is one of:

- a **string** → big title slide
- a **DOM element** → appended into the slide container
- a **function** `(slideContainer) => void` → called every time you nav to the slide; you own the DOM
- an **array** `[slide, ...notes]` → first item is any of the above; rest are presenter notes (strings)

`isPresenter` (optional) splits the view so the slide takes the top half and notes appear underneath — sniff the UA (`/iPhone|Android/`) to flip it on for the phone. You can also pass an options object here; `options.isPresenter` is used. `options.remote` enables the built-in options + PeerJS remote-control UI: `true` for defaults, or an object with `Peer`, `peerOptions`, `peerId`, `param`, `pairParam`, `controllerStorageKey`, or `buttonHideMs`.

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

`PowerSlides` is an event emitter:

```js
PS.on('changeSlide', n => console.log('now on slide', n))
```

### `PS.image(url, [backgroundSize])`

Full-bleed image slide. `backgroundSize` defaults to `"cover"`; pass `"contain"` to fit the whole image without cropping. See [`background-size` on MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/background-size).

### `PS.video(url, [options])`

Full-bleed video slide. Defaults: `{ loop: false, muted: false, controls: false, fit: 'contain' }`. `fit` is `'contain'` or `'cover'`. The video resets and plays every time you navigate to the slide.

### `PS.title(text, [style])`

A plain centered title slide. Useful as the foreground of `layeredTitle`:

```js
PS.title('Hello', { color: 'white', fontSize: '5vw' })
```

### `PS.layeredTitle(foreground, background, [options])`

Stacks a title on top of another slide (typically an image or video).

- `foreground` — string, DOM element, or slide function (e.g. `PS.title(...)`)
- `background` — any slide function, usually `PS.image(...)` or `PS.video(...)`
- `options.brightness` — multiplies background brightness (default `0.6`). Lower = darker = title more readable.

```js
PS.layeredTitle(
  'Title Over Image',
  PS.image('/bg.jpg'),
  { brightness: 0.5 }
)
```

### Navigation

- `PS.nextSlide()` / `PS.prevSlide()` — programmatic.
- Arrow keys — left/right.
- Touch — tap the left 20% / right 20% of the screen.
- URL hash — `#/3` jumps to slide 3, and the hash updates as you navigate.
- Options — when the built-in options UI is enabled, the visible Options button hides after about 5 seconds; press `o` to reopen it.

## Remote control

`power-slides` bundles an app-shell-level options panel and PeerJS remote control, so the shared CLI shell enables it once and each talk stays content-only. CLI dev/build entries copy the PeerJS browser runtime into the output and load it before the deck. Custom shells can pass a constructor as `remote.Peer`, or expose `window.Peer` before enabling remote control.

For custom shells using `PS.start` directly, enable it with `remote: true`; pass `remote: { Peer }` when your app bundles PeerJS itself:

```js
PS.start(document.body, slides, {
  isPresenter,
  remote: true
})
```

The Options button appears at boot and fades after about 5 seconds; press `o` to reopen it. Remote hosting does not start until you click **Enable remote control** in Options for that browser session. The deck then creates a PeerJS host, generates a one-time `pairKey`, and shows a QR code and URL. The URL uses query parameters (`ps-remote=<peer id>&ps-pair=<pairKey>` by default), leaving the hash for normal slide deep links.

The first controller opened from that URL stores a generated `clientId` in its `localStorage` and sends `{ type: 'hello', pairKey, clientId }`. If the pair key matches and the deck is not already locked, the deck stores that `clientId` in `sessionStorage` as the winning controller. The default lock key is based on the stable deck URL (`origin + pathname`, query/hash stripped), so it survives display reloads even when PeerJS assigns a new peer id; override it with `remote.controllerStorageKey`. After that, the deck accepts only the same `clientId`; other controllers receive `{ type: 'locked' }` and are closed. A reconnecting controller replaces its old connection.

The display stays authoritative. Remote messages are navigation intents only (`prev`, `next`, `goto`); the deck clamps and validates slide numbers, changes its own state, and sends state back. The controller view is minimal: full-width current-slide preview, full-width next-slide preview, then Prev/Next buttons, each preview scaled to fit a 16:9 viewport rather than cropped. Because it operates on `PowerSlides` navigation state, it works for both data-driven decks and custom `talk.js` slides, and remote commands use the same fast nav path as keyboard/touch — no waiting on per-slide preloading.

## Patterns

**Live demos.** A slide is a function, so plug in anything: a sandboxed iframe, a CodeMirror editor, a WebSocket-driven dashboard. Whatever runs in a browser tab runs on a slide.

**Reactive slides.** Subscribe to `changeSlide` to pause videos, stop timers, or fire analytics when the audience moves on.

**Presenter mode on your phone.** Open the deck on your laptop normally, and again on your phone with `isPresenter` flipped on (UA sniff works fine). The phone becomes your notes screen.

## Development

```bash
npm install
npm test          # standard linting, node remote tests, and CLI smoke tests
npm run build    # builds the minimal init starter; no long-lived server
npm run example  # live-reloading minimal starter; starts budo
npm run build:showcase # builds examples/showcase custom-renderer deck
```

PRs welcome. The core runtime stays small while the reusable talk shell keeps talks content-only; remote/options behavior is isolated in `remote.js` so it can move into a future app shell or ESM export cleanly.

## License

MIT © David Guttman
