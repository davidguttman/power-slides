# power-slides

Write browser-native slideshows from a small `slides.yaml` file instead of fighting a WYSIWYG.

```yaml
- title: Hello, world
  subtitle: A talk that's just a file
  background: /hero.png

- image: /diagram.png

- title: A slide can still be anything the browser can render.
  subtitle: power-slides
```

Start a deck with the CLI, edit the YAML, and deploy the built `public/` folder anywhere static files can live.

## Install

For a first deck, install the CLI once:

```bash
npm install -g power-slides
```

Prefer not to install globally? Use `npx` for the same commands:

```bash
npx power-slides init my-talk
```

## Create your first deck

```bash
power-slides init my-talk
cd my-talk
power-slides dev .
```

`init` creates a talk folder with:

- `slides.yaml` — default text, image, video, columns, iframe, html, and custom slide examples
- `talk.js` — optional JavaScript hooks for custom slides
- `public/` — files served at `/`, including starter image/video assets
- `assets/` — source assets not served directly
- `package.json` — optional local npm scripts for runners/deploys
- `README.md` — talk-local authoring notes

The generated `package.json` is useful when a host or runner expects npm scripts, but it is not required for the normal beginner flow. Starting from the global CLI is enough.

## Run, build, and deploy

```bash
power-slides dev .      # starts a local dev server
power-slides build .    # writes a static site into public/
```

`build` writes the deployable site into `public/`: `index.html`, the bundled `power-slides` runtime, the remote-control browser bundle, and the assets already in `public/`. Deploy the `public/` folder to any static host.

If you want local reproducible commands or runner-friendly scripts, use the generated npm path:

```bash
npm install
npm run dev
npm run build
```

The generated scripts are:

```json
{
  "scripts": {
    "dev": "powerslides dev .",
    "build": "powerslides build .",
    "start": "npm run dev"
  }
}
```

## Edit `slides.yaml`

A talk is a bare YAML or JSON array of slides. There is no top-level `slides:` wrapper and no separate title metadata — the title slide is just the first slide.

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
```

## How slides work

Every slide object has exactly one content property. Most are leaf content types:

- `title` — words on screen; unlocks `subtitle`, `eyebrow`, `bullets`, and `pullquote`
- `image` — unlocks `fit`
- `video` — unlocks `fit`, `controls`, `muted`, and `loop`
- `iframe` — unlocks `device`
- `html` — trusted inline markup
- `custom` — delegates to a `talk.js` renderer

`columns` is different: it is the container form. A `columns` slide holds an array of slide objects, and each column is rendered by the same slide renderer. You can think of a normal non-`columns` slide as shorthand for `columns` with one member: omitting `columns` means “render this one slide full-frame.”

Shared properties available on any slide are `background`, `brightness`, `align`, and `notes`/`note`.

## Slide concept reference

### `title`

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

### `image`

```yaml
- image: /diagram.png
  fit: contain
```

### `video`

```yaml
- video: /fractal-loop.mp4
  controls: true
  muted: true
  loop: true
  fit: contain
```

### `columns`

Use `columns` when you want to combine content types, such as iframe-plus-copy or image-plus-title. On narrow/portrait viewports, columns stack vertically in source order.

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

### `iframe`

```yaml
- iframe: https://david.app
  device: iphone
  background: '#061018'
```

### `notes`

```yaml
- title: Main point
  notes:
    - Pause here.
    - Then show the demo.
```

Use `notes` or `note` for slide-private speaker notes. They are metadata, not visible slide content.

### `html` and `custom`

Use `html` for trusted inline markup:

```yaml
- html: '<main style="padding:8vw;color:white"><h1>Raw HTML</h1></main>'
```

Use `custom` when the slide should be rendered by `talk.js`:

```yaml
- custom: particleField
  title: Generative canvas
```

## Remote control

The CLI shell includes remote control and loads the bundled PeerJS runtime for you. Run or build the deck, press `o` to open Options, then click **Enable remote control** to show the QR code / URL for your phone. Export `remote: false` from `talk.js` to disable it.

Remote commands are navigation intents only: previous, next, or go to slide. The display stays authoritative, so keyboard, touch, URL hash navigation, and remote control all stay in the same slide state.

## Optional `talk.js`

Most talks can stay entirely in `slides.yaml`. Add `talk.js` when a slide needs real browser code: a typewriter effect, live D3 visualization, WebGL toy, API fetch, or anything else the browser can render.

```js
export default {
  renderers: {
    demo (slide) {
      const el = document.createElement('section')
      el.innerHTML = `<h1>${slide.title || 'Live demo'}</h1>`
      return el
    }
  }
}
```

`talk.js` can export `renderers`, `custom`, `renderSlide(slide, PS)`, `slides(slides, PS)`, `bodyStyle`, and `beforeStart(PS, spec)`. Most first decks only need `renderers`.

Then reference the renderer from YAML:

```yaml
- custom: demo
  title: Browser-native slide
```

## Reference

- Full slide shape and advanced API reference lives in `docs/`.
- `examples/showcase/` contains custom renderers and animated slides.

## Development

```bash
npm install
npm test          # standard linting, node remote tests, and CLI smoke tests
npm run build    # builds the minimal init starter; no long-lived server
npm run example  # live-reloading minimal starter; starts budo
npm run build:showcase # builds examples/showcase custom-renderer deck
```

PRs welcome. The core runtime stays small while the reusable talk shell keeps talks content-only; remote/options behavior is isolated in `remote.js` so it can move cleanly into a future app shell.

## License

MIT © David Guttman
