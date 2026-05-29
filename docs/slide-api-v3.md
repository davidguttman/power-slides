# power-slides v3 slide shapes

A slide spec is a bare YAML array of slides. There are no top-level fields.

```yaml
- title: Main point
- image: /diagram.png
```

A slide is a set of **properties**. One exclusive content property decides what
the slide is; other properties are unlocked by (and only meaningful alongside)
that content property.

## Exclusive content properties

Exactly one per slide. These are mutually exclusive:

- `title` — words on screen
- `image`
- `video`
- `iframe`
- `html`
- `custom`
- `columns`

They can only be combined with `columns`. `columns` is the one container that
holds other content properties (each column is itself a slide-shaped object
with its own exclusive content property + modifiers).

## Shared properties

Available on any slide regardless of content property:

- `background` — unlocks `brightness`
- `brightness` — scrim darkness behind content (only meaningful with `background`)
- `align`

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
