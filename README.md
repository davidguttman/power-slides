# power-slides

Live example: https://powerslides.david.app

Start simple: one `slides.yaml` file and one command. Then use the phone remote for the real control view while the projected slides stay sparse and high-impact.

```yaml
- title: Simple to start.
  subtitle: One slides.yaml file. One command.
  background: /title.png
  brightness: 0.35
  notes:
    - The wall gets the headline. Your phone gets the full story.

- title: "Checkpoint: use your phone."
  subtitle: Press o → Enable remote control → scan → continue here.
  notes:
    - Drive the deck from the phone after this slide.
    - The remote shows notes, navigation, current and next-slide previews, and talk/slide timers.

- columns:
    - image: /github-render.png
      fit: contain
    - title: One folder. Real assets.
      subtitle: public/ ships with the deck.

- iframe: https://david.app
  device: iphone
  background: "center / cover no-repeat url('/deploy.png')"

- custom: particleField
```

Start a deck with the CLI, edit the YAML, drop static assets into `public/`, present from your phone, and deploy the built `public/` folder anywhere static files can live.

## Create your first deck

Create a deck with `npx`:

```bash
npx power-slides init my-talk
cd my-talk
npx power-slides dev .
```

`init` creates a talk folder with:

- `slides.yaml` — deck content and speaker notes
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
- title: Simple to start.
  subtitle: One slides.yaml file. One command.
  background: /title.png
  brightness: 0.35
  align: center
  notes:
    - Simple to start, but no limits on power.
    - Keep the audience slide sparse; put the speaker story here.

- title: "Checkpoint: use your phone."
  subtitle: Press o → Enable remote control → scan → continue here.
  notes:
    - Stop here, enable the remote, then keep presenting from the phone.
    - Use notes for the script, previews for transitions, and timers for pacing.

- columns:
    - image: /github-render.png
      fit: contain
    - title: One folder. Real assets.
      subtitle: public/ ships with the deck.

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
    - title: No limits on power.
      subtitle: Compose layouts, media, and browser primitives.

- iframe: https://david.app
  device: iphone
  background: "center / cover no-repeat url('/deploy.png')"
```

## Slide shapes at a glance

Each slide can have one of the following:

- `title` — words on screen, with optional `subtitle`, `eyebrow`, `bullets`, `pullquote`, or `notes`
- `image` — static assets as full-slide images or media inside designed layouts
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
  - title: Simple to start.
    subtitle: One slides.yaml file. One command.
    background: /title.png
    brightness: 0.35

  - title: "Checkpoint: use your phone."
    subtitle: Press o → Enable remote control → scan → continue here.
```

## Remote control

Run or build the deck, press `o` to open Options, click **Enable remote control**, then scan the QR code or open the shown URL on your phone.

The phone remote is the control surface: it navigates the deck, shows the full notes for the current slide, previews the current and next slide, and keeps talk/slide timers visible for pacing.

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

For more `talk.js` hooks, see `docs/slide-api.md`. The packaged `examples/starter/` deck is the maintained example and init template.

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
