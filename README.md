# power-slides

Create browser-native slideshows from a small `slides.yaml` file, then use your phone as a remote control.

```yaml
- title: Hello, world
  subtitle: A talk that's just a file
  background: /hero.png

- image: /diagram.png

- title: A slide can still be anything the browser can render.
  subtitle: power-slides
```

Start a deck with the CLI, edit the YAML, and deploy the built `public/` folder anywhere static files can live.

## Create your first deck

Create a deck with `npx`:

```bash
npx power-slides init my-talk
cd my-talk
npx power-slides dev .
```

`init` creates a talk folder with:

- `slides.yaml` — deck content
- `talk.js` — optional browser code for custom slides
- `public/` — media and static files served by the deck

## Run, build, and deploy

```bash
npx power-slides dev .      # starts a local dev server
npx power-slides build .    # writes deployable static files into public/
```

Deploy the `public/` folder to any static host.

## Edit `slides.yaml`

`slides.yaml` is a YAML array of slide objects. Each item is one slide.

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

## Slide shapes at a glance

Each slide can have one of the following:

- `title` — words on screen, with optional `subtitle`, `eyebrow`, `bullets`, or `pullquote`
- `image` — a full-slide image
- `video` — a full-slide video
- `iframe` — a web page embed, optionally framed as a device
- `html` — trusted inline markup
- `custom` — a named renderer from `talk.js`

To combine types, use `columns`, such as iframe-plus-copy or image-plus-title.

The full slide shape and advanced API reference lives in `docs/slide-api.md`.

## Remote control

Run or build the deck, press `o` to open Options, click **Enable remote control**, then scan the QR code or open the shown URL on your phone.

The phone remote navigates the deck.

## Optional `talk.js`

Use `talk.js` for slides that need browser code: a typewriter effect, live D3 visualization, WebGL toy, API fetch, or anything else the browser can render.

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

Then reference the renderer from YAML:

```yaml
- custom: demo
  title: Browser-native slide
```

For more `talk.js` hooks, see `docs/slide-api.md`. For custom renderers and animated slides, see `examples/showcase/`.

## License

MIT © David Guttman


## Advanced: npm runners

`init` also writes a small `package.json` for hosts or CI runners that expect npm scripts:

```bash
npm install
npm run dev
npm run build
```

Use those scripts for hosts, CI, or deploy flows that run npm commands.
