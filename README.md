# power-slides

Live example: https://powerslides.david.app

Agent-friendly deck creation: one `slides.yaml` file and one command. Slides are plain text, so an agent can edit, reorder, and reuse them — then you present from your phone, where the remote shows your notes, the next slide before the room sees it, and timers that keep your pacing honest.

```yaml
- title: Power Slides
  eyebrow: Introducing
  subtitle: Agent-friendly deck creation
  notes:
    - Built so an agent can create and revise the deck while you focus on the talk.

- columns:
    - title: Focused slides in plain text
      eyebrow: Start simple with
      subtitle: Easy for agents to edit, reorder, and reuse
    - image: /generated/plain-text-card.png
      fit: contain
  background: /generated/plain-text-16bit.png
  notes:
    - Each slide is a few lines of YAML, exactly what an agent is good at editing.

- columns:
    - image: /remote-control.png
      fit: contain
    - title: Remote Control
      eyebrow: Use your phone as a
      subtitle: Next slide preview, notes, pacing timers

- title: Full screen video
  eyebrow: Media helpers like
  subtitle: (on the next slide)

- video: /fractal-loop.mp4
  controls: true
  muted: true
  loop: true
  fit: contain

- columns:
    - title: Iframe Helper
      eyebrow: Interact with live web apps using the
      subtitle: Power Slides gives you both mobile and desktop options
    - iframe: https://david.app
      device: iphone
      screenBackground: '#061018'

- custom: particleField

- html: |
    <section class="ps-install-terminal">
      <!-- terminal-shaped install card with a talk-name input, generated commands, and Copy All -->
    </section>
```

Start a deck with the CLI, edit the YAML, drop static assets into `public/`, present from your phone, and deploy the built `public/` folder anywhere static files can live.

## Create your first deck

Create a deck with `npx`:

```bash
npx power-slides init best-talk-ever
cd best-talk-ever
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
- title: Power Slides
  eyebrow: Introducing
  subtitle: Agent-friendly deck creation
  align: center
  notes:
    - Plain text means an agent can draft and revise the deck for you.
    - Keep each slide focused; put the speaker story in the notes.

- columns:
    - title: Focused slides in plain text
      eyebrow: Start simple with
      subtitle: Easy for agents to edit, reorder, and reuse
    - image: /generated/plain-text-card.png
      fit: contain
  background: /generated/plain-text-16bit.png
  notes:
    - Each slide is a few lines of YAML, exactly what an agent is good at editing.
    - Ask an agent to restructure the deck, then review the diff like any change.

- columns:
    - image: /remote-control.png
      fit: contain
    - title: Remote Control
      eyebrow: Use your phone as a
      subtitle: Next slide preview, notes, pacing timers

- title: Full screen video
  eyebrow: Media helpers like
  subtitle: (on the next slide)

- video: /fractal-loop.mp4
  controls: true
  muted: true
  loop: true
  fit: contain

- columns:
    - title: Iframe Helper
      eyebrow: Interact with live web apps using the
      subtitle: Power Slides gives you both mobile and desktop options
    - iframe: https://david.app
      device: iphone
      screenBackground: '#061018'

- custom: particleField

- html: |
    <section class="ps-install-terminal">
      <!-- terminal-shaped install card with a talk-name input, generated commands, and Copy All -->
    </section>
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
title: Best Talk Ever
style:
  fontFamily: Inter, system-ui, sans-serif
  background: '#061018'
  color: white
  "--accent": '#5ffbf1'
slides:
  - title: Power Slides
    eyebrow: Introducing
    subtitle: Agent-friendly deck creation

  - title: Focused slides in plain text
    eyebrow: Start simple with
    subtitle: Easy for agents to edit, reorder, and reuse
```

## Remote control

Run or build the deck, press `o` to open Options, click **Enable remote control**, then scan the QR code or open the shown URL on your phone.

The phone remote is the real control surface, and each piece of it earns its place:

- **Next-slide preview** so you are never surprised by your own deck and never spoil the next beat — you set up the transition before you tap forward.
- **Slide timer** so you can feel your pacing on the current slide instead of guessing.
- **Talk timer** so you protect the ending and don't rush the close after losing track of time.
- **Estimated duration** from your per-slide timers, so you know the talk fits its slot before you ever present.
- **Notes on the phone** so the projected slide stays focused on a single point.

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
