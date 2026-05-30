# power-slides slide API

A slide spec can be a deck object with optional top-level metadata and CSS defaults:

```yaml
title: My Talk
style:
  fontFamily: Inter, system-ui, sans-serif
  background: '#222'
  color: white
  "--accent": '#5ffbf1'
slides:
  - title: Main point
  - image: /diagram.png
```

The bare array form still works unchanged:

```yaml
- title: Main point
- image: /diagram.png
```

Top-level `title` becomes the generated HTML document title. When it is absent,
the CLI falls back to the first string slide or first slide `title`/`text` it finds.
Top-level `style` is normal CSS as an object or CSS string, including custom
properties. The generated CLI entry applies body style in this order: runtime
baseline (`margin: 0`, black background, hidden overflow), then `slides.yaml`
`style`, then `talk.js` `bodyStyle` for existing advanced JS overrides.

A slide is a set of **properties**. One exclusive content property decides what
the slide is; other properties are unlocked by (and only meaningful alongside)
that content property.

## Content property

Every slide has exactly one content property. Six are leaf content types — a
slide is one and only one of these:

- `title` — words on screen
- `image`
- `video`
- `iframe`
- `html`
- `custom`

`columns` is the seventh, and it's different: it's a **container**, not a leaf.
A `columns` slide holds an array of slides, and each of those is again exactly
one content property (including, if you want, another `columns`). You can think
of any non-`columns` slide as shorthand for `columns` with one member: omitting
`columns` means “render this one slide full-frame.”

So you never combine two content types on one slide. To put two together — an
image beside a title, a video next to bullets — you nest them as columns. That
is the only way content types combine, and it falls straight out of "a column
is a slide."

## Shared properties

Available on any slide regardless of content property:

- `background` — unlocks `brightness`
- `brightness` — scrim darkness behind content (only meaningful with `background`)
- `align`
- `notes` — speaker-note metadata; string or array of strings, not projected on the slide

## title

Unlocks: `subtitle`, `eyebrow`, `bullets`, `pullquote`.

```yaml
- title: Main point
```

```yaml
- title: Very funny.
  subtitle: —you, probably
  background: /dark-bg.png
  brightness: 0.6
```

```yaml
- eyebrow: Section
  title: Main point
  subtitle: Optional subtitle
  background: /hero.png
  brightness: 0.45
  align: center
```

```yaml
- title: What changed
  bullets:
    - YAML stays content-first
    - JS handles special moments
  pullquote: Build static files to share.
  notes:
    - Pause here, then show the built `public/` folder.
```

## image

Unlocks: `fit`.

```yaml
- image: /diagram.png
```

```yaml
- image: /diagram.png
  fit: contain
```

## video

Unlocks: `fit`, `controls`, `muted`, `loop`.

```yaml
- video: /fractal-loop.mp4
```

```yaml
- video: /fractal-loop.mp4
  controls: true
  muted: true
  loop: true
  fit: contain
```

## iframe

Unlocks: `device`.

```yaml
- iframe: https://david.app
```

```yaml
- iframe: https://david.app
  device: iphone
```

## html

```yaml
- html: |
    <div style="width:100vw;height:100vh;color:white">
      <h1>Custom HTML</h1>
    </div>
```

## custom

`custom: $name` selects the renderer. Any other properties are passed through
to that function untouched.

```yaml
- custom: particleField
  count: 4000
  speed: 0.6
  palette: ['#ff5f6d', '#ffc371']
```

## columns

The only container. Each column **is a slide** — it takes any exclusive content
property and its modifiers, rendered by the same slide renderer, scaled to fill
the column instead of the viewport. That includes `image`, `video`, `iframe`,
`html`, `custom`, `title`, and even nested `columns`.

On a portrait / narrow viewport (e.g. a phone), columns stack vertically as
rows instead of sitting side by side, in source order top to bottom.

```yaml
- columns:
    - title: Left column
    - title: Right column
```

```yaml
- columns:
    - video: /fractal-loop.mp4
      muted: true
      loop: true
    - title: What you're seeing
      bullets:
        - Records every step
        - Replays on demand
```

```yaml
- columns:
    - custom: particleField
    - html: |
        <div><h1>Inline markup</h1></div>
```

```yaml
- columns:
    - title: Overview
    - columns:
        - image: /a.png
        - image: /b.png
```

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
- background: /generated/beat-1-you.png
  columns:
    - title: Discord messages per day
    - image: /images/discord-volume.png
      fit: contain
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

## Advanced style override properties

Any property whose name ends in `Style` accepts the same two forms in YAML and JavaScript:

- canonical object form with camelCase CSS properties
- CSS declaration string form, useful when pasting existing CSS

Object form is preferred because it stays structured in YAML:

```yaml
- title: Main point
  titleStyle:
    fontSize: 12pt
    color: red
```

CSS strings are also accepted and converted to the same camelCase properties:

```yaml
- title: Main point
  titleStyle: "color: red; font-size: 12pt"
```

Style overrides apply after built-in defaults. This rule is shared by text,
columns, iframe phone layouts, iframe/device chrome, side-copy fields, and
media/image escape hatches.

## JavaScript module usage

The beginner path is the CLI plus `slides.yaml`. Use the module API when you are embedding `power-slides` inside another browser app or building a custom shell.

```js
import PowerSlides, { text, image, startTalk } from 'power-slides'

startTalk(document.body, [
  { title: 'Hello', subtitle: 'Reusable talks' },
  { image: '/diagram.png', fit: 'contain' }
])
```

### `startTalk(el, slidesOrSpec, [options])`

ESM entry point. Renders a slide array into `el`. The ESM `PowerSlides` object has all data-driven helpers (`text`, `image`, `video`, `columns`, `iframe`, `html`, …) attached.

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

Stacks a title on top of another slide, typically an image or video.

- `foreground` — string, DOM element, or slide function, for example `PS.title(...)`
- `background` — any slide function, usually `PS.image(...)` or `PS.video(...)`
- `options.brightness` — multiplies background brightness; lower means darker and more readable title text

```js
PS.layeredTitle(
  'Title Over Image',
  PS.image('/bg.jpg'),
  { brightness: 0.5 }
)
```

### Navigation

- `PS.nextSlide()` / `PS.prevSlide()` — programmatic navigation
- Arrow keys — left/right
- Touch — tap the left 20% / right 20% of the screen
- URL hash — `#/3` jumps to slide 3, and the hash updates as you navigate
- Options — when the built-in options UI is enabled, the visible Options button hides after about 5 seconds; press `o` to reopen it

## Asset loading

The first slide renders immediately. After that, power-slides starts loading image/video assets referenced by later slides — including remote URLs — so the deck feels smoother without blocking the first paint. Helpers attach `slide.assets` automatically; custom renderers can do the same:

```js
const slide = (el) => { /* render */ }
slide.assets = ['https://cdn.example.com/background.png']
export default { renderers: { custom: () => slide } }
```

