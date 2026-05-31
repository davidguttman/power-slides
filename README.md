# power-slides

Start with one `slides.yaml` file, then reveal that it is still just the browser underneath.

```yaml
- title: One YAML file. Full browser power.
  subtitle: Start with slides.yaml, then press o for remote control.
  background: /title.png
  brightness: 0.35

- image: /github-render.png
  fit: contain

- iframe: about:blank
  srcdoc: <main>Live web in a phone frame</main>
  device: iphone
  background: "center / cover no-repeat url('/deploy.png')"

- custom: particleField
```

Start a deck with the CLI, edit the YAML, drop static assets into `public/`, and deploy the built `public/` folder anywhere static files can live.

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

Start with a YAML list. Each item is one slide.

```yaml
- title: One YAML file. Full browser power.
  subtitle: Start with slides.yaml, then press o for remote control.
  background: /title.png
  brightness: 0.35
  align: center

- image: /github-render.png
  fit: contain

- video: /fractal-loop.mp4
  controls: true
  muted: true
  loop: true
  fit: contain

- background: /build-it.png
  brightness: 0.66
  columns:
    - image: /workflow.png
      fit: contain
    - title: Composition is the model
      bullets:
        - Every column is another slide
        - Mix assets, copy, media, and embeds without glue code
        - Keep the story readable while the layout gets richer
      pullquote: YAML stays declarative; the browser does the stage work.

- iframe: about:blank
  srcdoc: <main>Live web in a phone frame</main>
  device: iphone
  background: "center / cover no-repeat url('/deploy.png')"
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

## Theming and deck metadata

For deck-wide metadata or CSS defaults, wrap the same slide list in a deck object with `title`, `style`, and `slides`.

```yaml
title: My Talk
style:
  fontFamily: Inter, system-ui, sans-serif
  background: '#061018'
  color: white
  "--accent": '#5ffbf1'
slides:
  - title: One YAML file. Full browser power.
    subtitle: Start with slides.yaml, then press o for remote control.
    background: /title.png
    brightness: 0.35

  - image: /github-render.png
```

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
