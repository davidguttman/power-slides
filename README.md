# power-slides

ESM-first reusable talk kit for browser slide decks, with the original tiny JavaScript slideshow runtime still available for custom decks.

`power-slides` lets new talks stay content-only: `slides.yaml` (or JSON), optional `talk.js`, and assets. The package owns the shared HTML shell, Browserify + Terser build, budo dev wiring, slide helpers, asset loading, and app-shell behavior like options/remote control. If you want to author directly in JS, a slide can still be a function that does *anything* the browser can do.

## Why power-slides?

- **Content-first talks.** Start with `slides.yaml` (or JSON); add `talk.js` only when JavaScript earns its keep.
- **A slide can still be a function.** Want a typewriter effect, a live D3 chart, a WebGL toy, a fetch from your own API? Just write it.
- **Tiny slide-authoring surface area.** Keep normal slides as data; use `talk.js` only for custom effects. Shell behavior like options and remote control stays in the runtime.
- **Keyboard + touch nav out of the box.** Left/right arrows, tap the edges on mobile.
- **Deep links.** Every slide has a URL hash (`#/7`). Reload, share, jump.
- **Presenter mode.** Split view with your speaker notes underneath the slide.

---

## Install

Install globally or run with your package manager's executor to create a talk:

```bash
npm install -g power-slides
powerslides init my-talk
```

## Create a talk

```bash
powerslides init my-talk
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
    "power-slides": "^2.0.4"
  }
}
```

`powerslides dev .` uses the port from `--port <port>`, then `$PORT`, then `9966`.

`init` creates a talk folder by generating the local `package.json` and copying the packaged `example/` starter authoring files:

- `package.json` — local npm scripts plus a dev dependency on the published `power-slides` package
- `slides.yaml` — content and notes
- `talk.js` — optional ESM custom renderers / escape hatch
- `public/` — example media and files served at `/` (videos, generated images, fonts)
- `assets/` — source assets not served directly
- `README.md` — talk-local authoring notes

It refuses to run in a non-empty directory unless you pass `--force`, and it does not overwrite existing files. It copies the packaged example media needed by the starter, but does **not** copy a lockfile, `node_modules`, generated bundles, or `public/index.html` into the talk.

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

A talk is an object with a `slides` array. The title slide is just the first slide. YAML and JSON use the same schema; without `--slides`, the CLI picks `slides.yaml`, then `slides.yml`, then `slides.json`.

```yaml
slides:
  - type: overlay
    eyebrow: David Guttman
    title: My Talk
    subtitle: Optional subtitle
    background: /generated/title.png
    brightness: 0.5
    notes:
      - Presenter note.
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

### Common slide fields

Every YAML slide is an object. If `type` is omitted, `overlay` is used. Unknown `type` values also fall back to `overlay` unless `talk.js` supplies a renderer for that key.

- `type` — built-in type: `overlay`, `title`, `image`, `video`, `quote`, `chart`, `summary`, `iframe`, `html`, `custom`.
- `notes` or `note` — string or array of strings for presenter mode.
- `renderer`, `name`, or `kind` — renderer key checked before built-ins. This is how `type: custom` selects `talk.js` renderers, and it can also override a built-in slide for one slide.

### Built-in slide type reference

#### `overlay` (default) / `title`

Use `overlay` for normal title/copy slides, optionally over a dimmed background. `title` is a simpler centered title slide that accepts only text plus `style`.

```yaml
- type: overlay
  eyebrow: Section
  title: Write content. Reuse the app.
  subtitle: Optional subtitle copy
  background: /hero.png
  brightness: 0.45
  align: left
```

`overlay` fields:

- Copy: `eyebrow`, `title` (or `text`), `subtitle`.
- Background asset: `background` (or `image`/`src`), `backgroundSize` (default `cover`), `backgroundPosition` (default `center`), `backgroundColor`.
- Layout/theme: `brightness`, `align` (`center` or `left`), `font`, `color`, `padding`, `maxWidth`, `titleSize`, `subtitleSize`, `subtitleOpacity`, `subtitleMaxWidth`, `eyebrowSize`.

`title` fields:

- Text: `title` (or `text`/`quote`).
- `style` — CSS style object applied to the centered title wrapper.

#### `image`

Full-slide background image.

```yaml
- type: image
  src: /diagram.png
  fit: contain
```

Fields: `src` (or `img`/`image`/`background`) and `fit` (or `size`), defaulting to `cover`. Use `contain` to avoid cropping.

#### `video`

Full-slide video.

```yaml
- type: video
  src: /demo.mp4
  controls: true
  muted: true
  loop: true
  size: contain
```

Fields: `src` (or `video`), `controls`, `muted`, `loop`, `autoplay` (`false` disables default autoplay), `preload`, `poster`, and `size` (`contain` or `cover`, default `contain`).

#### `quote`

Large quote/text slide with an optional image column and optional background.

```yaml
- type: quote
  eyebrow: Key idea
  quote: Slide 1 shows immediately.
  image: /screenshot.png
  background: /dark-bg.png
```

Fields: `quote` (or `text`), `eyebrow`, side image `image` (or `img`/`src`), `background`, `brightness`, `font`, `color`, and `size`.

Layout fields: `columns` (or `gridTemplateColumns`), `rows` (or `gridTemplateRows`), `gap`, `padding`, `alignItems`, and `justifyItems`. Copy placement fields: `align`/`copyAlign`, `copyJustify`, `copyAlignSelf`, `copyMaxWidth`, and `copyStyle`. Image fields: `fit`, `maxHeight`/`imageMaxHeight`, `maxWidth`/`imageMaxWidth`, `radius`, `shadow` (`false` removes shadow), `imageAlign`, `imageJustify`, `imageAlignSelf`, `imageJustifySelf`, `mediaStyle`, and `imageStyle`.

#### `chart`

A quote-style slide tuned for chart/screenshot images. Same fields as `quote`; `src`/`img`/`image` becomes the image column and the default text size is slightly smaller. It inherits the quote layout defaults and override fields.

```yaml
- type: chart
  quote: Revenue by month
  src: /chart.png
```

#### `summary`

Two-column recap slide with copy on the left and a card on the right.

```yaml
- type: summary
  eyebrow: Recap
  title: Ship talks, not boilerplate
  accent: '#ffcc6a'
  card:
    title: What changed
    bullets:
      - YAML stays content-only
      - talk.js handles special moments
    pull: Build static files to share.
```

Fields: left copy `eyebrow`, `title` (or `quote`), `background`, `brightness`, `font`, `color`, `accent`, and `card` with `title`, `bullets`, and `pull`.

#### `iframe`

Embeds an external URL or inline `srcdoc`. Parent-level corner arrows remain available by default so cross-origin iframes cannot trap deck navigation.

```yaml
- type: iframe
  src: https://example.com/embedded-demo
  title: Example app
  device: iphone
  layout: phone-right
  side:
    eyebrow: Live demo
    title: A real app in the deck
    subtitle: The page runs in the phone; the slide carries the story.
    bullets:
      - Cross-origin iframe stays untouched
      - Parent arrows remain available
```

Core fields:

- Content: `src` (or `url`) for external pages, or `srcdoc` for inline HTML; `title` for iframe accessibility.
- Browser permissions: `allow`, `allowFullscreen` (`false` disables), `loading`, `referrerPolicy`, `sandbox`.
- Frame/nav behavior: `navigationControls` (`false` hides parent arrows), `forwardKeys` (`false` disables best-effort same-origin key forwarding), `background`, `iframeStyle`, `stagePadding`/`rootPadding`.
- Phone frame: `device: iphone` or `frame: phone`; style with `deviceWidth`/`frameWidth`, `deviceAspectRatio`, `devicePadding`, `deviceBorder`, `deviceRadius`, `deviceBackground`, `deviceShadow`, `deviceStyle`, `screenRadius`, `screenBackground`.
- Phone + side-copy layout: `layout` or `phoneLayout` as `phone-right`/`phone-left`; layout style with `layoutWidth`, `layoutMaxWidth`, `layoutGap`, `layoutPadding`, `layoutStyle`.
- `side` copy: `eyebrow`, `title`, `subtitle`, `body`/`text`, `bullets`, `position`/`side`, `color`, `font`, `accent`, `maxWidth`, `style`, plus size/color knobs `eyebrowColor`, `eyebrowSize`, `titleColor`, `titleSize`, `subtitleColor`, `subtitleSize`, `bodyColor`, `bodySize`, `bulletColor`, `bulletSize`, `bulletGap` and matching `*Weight`, `*Opacity`, `*LetterSpacing` fields where used.
- Arrow styling: `navControlInset`, `navControlSize`, `navControlOpacity`.

#### `html`

Injects trusted HTML directly into the slide container.

```yaml
- type: html
  html: '<main style="padding:8vw;color:white"><h1>Raw HTML</h1></main>'
```

Fields: `html` (or `markup`). Treat this as trusted content; do not put untrusted user input here.

#### `custom`

Delegates rendering to `talk.js`. `name`, `kind`, or `renderer` chooses the renderer. If no renderer matches, the deck shows a “Missing custom renderer” title slide.

```yaml
- type: custom
  name: particleField
  title: Generative canvas
  assets:
    - /texture.png
```

Any extra fields are passed through to the renderer.

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

`talk.js` may export these hooks:

- `renderers` — map renderer names to `(slide, PS) => slideFunction`. `PS` is the power-slides helper object.
- `custom` — alias map for renderers.
- `renderSlide(slide, PS)` — optional catch-all; return a rendered slide to override normal dispatch, or return nothing to continue.
- `slides(slides, PS)` — transform/theme the parsed slide array before rendering.
- `bodyStyle` — CSS text applied to `document.body` by the CLI entry.
- `beforeStart(PS, spec)` — setup hook called by the CLI entry just before `startTalk()`.

Renderer return values can be slide functions, DOM nodes, or strings. The build exposes the package as `power-slides`, so advanced `talk.js` files may also import helpers directly.

## Asset loading

The first slide renders immediately. After that, power-slides starts loading image/video assets referenced by later slides so the deck feels smoother without blocking the first paint.

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

### `PS.start(el, slides, [isPresenter], [options])`

Mounts the slideshow into `el` (usually `document.body`).

- `el` — DOM element to render into.
- `slides` — array. Each entry is one of:
  - a **string** → rendered as a big title slide
  - a **DOM element** → appended into the slide container
  - a **function** `(slideContainer) => void` → called every time you navigate to the slide; you own the DOM
  - an **array** `[slide, ...notes]` → first item is any of the above; remaining items are presenter notes (strings)
- `isPresenter` — optional boolean. When truthy, splits the view so the slide takes the top half and notes appear underneath. A common pattern is to flip it on based on user agent (`/iPhone|Android/`) so your phone becomes the notes screen. You can also pass an options object here; `options.isPresenter` will be used.
- `options.remote` — optional boolean/object for shells that want to enable the built-in options + PeerJS remote-control UI. Pass `true` for defaults or an object with `Peer`, `peerOptions`, `peerId`, `param`, `pairParam`, `controllerStorageKey`, or `buttonHideMs`.

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
- Options — when the built-in options UI is enabled, the visible Options button hides after about 5 seconds; press `o` at any time to reopen it.

### Built-in options + remote control

`power-slides` includes the runtime pieces for an app-shell-level options overlay and PeerJS remote control. The intended reusable-talk flow is that the shared power-slides shell enables this once, so each talk stays content-only (`slides.yaml`/JSON, optional `talk.js`, and assets) instead of copying remote-control code. The shell is responsible for loading PeerJS: pass a constructor as `remote.Peer`, or expose `window.Peer` before enabling remote control. `power-slides` does not bundle PeerJS itself.

For custom shells using `PS.start` directly, enable the built-in capability with `remote: true`:

```js
PS.start(document.body, slides, {
  isPresenter,
  remote: true
})
```

On the deck, the Options button appears at boot and fades after about 5 seconds; press `o` to reopen Options any time. Remote hosting does not start immediately. Click **Enable remote control** in Options for that browser session, then the deck creates a PeerJS host, generates a one-time `pairKey`, and shows both a QR code and URL. If PeerJS is not available, the UI reports that and leaves the enable action retryable after the shell loads PeerJS. The URL uses query parameters (`ps-remote=<peer id>&ps-pair=<pairKey>` by default), leaving the hash for normal slide deep links.

The first controller opened from that URL stores a generated `clientId` in its `localStorage` and sends `{ type: 'hello', pairKey, clientId }`. If the pair key matches and the deck is not already locked, the deck stores that `clientId` in `sessionStorage` as the winning controller. The default lock key is based on the stable deck URL (`origin + pathname`, with query/hash stripped), so it survives display reloads even when PeerJS assigns a new random peer id; shells can override it with `remote.controllerStorageKey`. After that, the deck ignores pair keys and accepts only the same `clientId`; other controllers receive `{ type: 'locked' }` and are closed. If the same controller reconnects, it replaces the old active connection.

The display remains authoritative. Remote messages are navigation intents only (`prev`, `next`, `goto`); the deck clamps and validates slide numbers, changes its own state, and sends state/notes back to the controller. The phone/controller view shows compact previews of the current slide and the next slide based on that received deck state, with notes and controls still available underneath. The remote operates on `PowerSlides` state and navigation (`nextSlide`, `prevSlide`, hash changes, notes), not on how the slide definitions were authored, so it fits both data-driven `slides.yaml`/JSON decks and custom `talk.js` slides. Remote commands do not wait on per-slide loading or preloading; they use the same fast navigation path as keyboard/touch input.


---

## Patterns

**Live demos.** A slide is a function, so plug in anything: a sandboxed iframe, a CodeMirror editor, a WebSocket-driven dashboard. Whatever runs in a browser tab runs on a slide.

**Reactive slides.** Subscribe to `changeSlide` to pause videos, stop timers, or trigger analytics when the audience moves on.

**Presenter mode on your phone.** Open the deck on your laptop normally, and again on your phone (sniff the UA, like the example does, to flip on `isPresenter`). Use the phone as your notes screen.

---

## Development

```bash
npm install
npm test          # standard linting, node remote tests, and CLI smoke tests
npm run build    # builds the bundled example; no long-lived server
npm run example  # live-reloading example deck; starts budo
```

PRs welcome. The core runtime stays small while the reusable talk shell keeps talks content-only; remote/options behavior is isolated in `remote.js` so it can move into a future app shell or ESM export cleanly.

## License

MIT © David Guttman
