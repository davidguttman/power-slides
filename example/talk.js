const palette = {
  void: '#11091e',
  night: '#180d2d',
  surface: '#241044',
  panel: 'rgba(17, 9, 30, 0.72)',
  line: 'rgba(255, 255, 255, 0.18)',
  pink: '#ff6ec7',
  cyan: '#5ffbf1',
  yellow: '#f9f871',
  purple: '#8b9aff',
  white: '#ffffff',
  muted: 'rgba(255, 255, 255, 0.74)'
}

const theme = {
  font: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
  padding: 'clamp(3rem, 7vh, 5.5rem) clamp(3.5rem, 7vw, 7rem)',
  columns: {
    width: 'min(1180px, 92vw)',
    padding: 'clamp(2.2rem, 5vh, 4.2rem) clamp(3.5rem, 7vw, 7rem)',
    gap: 'clamp(2.4rem, 4.8vw, 5rem)',
    template: 'minmax(0, 0.92fr) minmax(20rem, 0.78fr)',
    copyMaxWidth: '35rem',
    panelMaxWidth: '31rem',
    phoneWidth: 'min(54vh, 30vw, 430px)'
  },
  copyWidth: 'min(62rem, 72vw)',
  titleSize: 'clamp(3.1rem, 6vw, 6.4rem)',
  subtitleSize: 'clamp(1.15rem, 1.55vw, 1.65rem)',
  bodySize: 'clamp(1rem, 1.18vw, 1.25rem)',
  eyebrowSize: 'clamp(0.78rem, 0.9vw, 0.98rem)',
  cardRadius: 'clamp(1rem, 1.6vw, 1.35rem)',
  shadow: '0 1.4rem 4rem rgba(0, 0, 0, 0.38)'
}

const background = `
  radial-gradient(circle at 18% 18%, rgba(255, 110, 199, 0.22), transparent 28%),
  radial-gradient(circle at 82% 22%, rgba(95, 251, 241, 0.16), transparent 30%),
  linear-gradient(135deg, ${palette.void}, ${palette.surface} 58%, #090512)
`

export default {
  bodyStyle: `
    margin: 0;
    background: ${palette.void};
    color: ${palette.white};
    font-family: ${theme.font};
    overflow: hidden;
  `,
  slides: themedSlides,
  renderers: {
    glitchTerminal,
    particleField,
    cssCascade,
    end
  }
}

function themedSlides (slides) {
  return slides.map((slide, index) => themeSlide(slide, index))
}

function themeSlide (slide, index) {
  if (!slide || typeof slide !== 'object' || Array.isArray(slide)) return slide

  if ((slide.type || 'overlay') === 'overlay') {
    return Object.assign({
      align: 'left',
      font: theme.font,
      color: palette.white,
      backgroundColor: palette.void,
      padding: theme.padding,
      maxWidth: theme.copyWidth,
      titleSize: theme.titleSize,
      subtitleSize: theme.subtitleSize,
      subtitleMaxWidth: '36em',
      eyebrowSize: theme.eyebrowSize,
      brightness: index === 0 ? 0.58 : 0.5
    }, slide)
  }

  if (slide.type === 'quote') {
    return Object.assign({
      font: theme.font,
      color: palette.white,
      backgroundColor: palette.void,
      eyebrow: 'Remote image',
      size: 'clamp(2.4rem, 4.15vw, 4.7rem)',
      brightness: 0.58
    }, slide)
  }

  if (slide.type === 'iframe') {
    return Object.assign({
      font: theme.font,
      color: palette.white,
      background,
      stagePadding: theme.columns.padding,
      layoutWidth: theme.columns.width,
      layoutPadding: '0',
      layoutGap: theme.columns.gap,
      layoutStyle: {
        gridTemplateColumns: theme.columns.template
      },
      deviceWidth: theme.columns.phoneWidth,
      deviceStyle: {
        justifySelf: 'center'
      },
      deviceShadow: '0 2rem 5rem rgba(0, 0, 0, 0.46), inset 0 0 0.35vh rgba(255, 255, 255, 0.2)'
    }, slide, {
      side: themedSide(slide.side)
    })
  }

  return slide
}

function themedSide (side) {
  const copy = side || {}
  return Object.assign({
    color: palette.white,
    font: theme.font,
    accent: palette.yellow,
    maxWidth: theme.columns.copyMaxWidth,
    eyebrowSize: theme.eyebrowSize,
    titleSize: 'clamp(2.8rem, 4.8vw, 5.2rem)',
    subtitleSize: theme.subtitleSize,
    subtitleColor: palette.muted,
    subtitleOpacity: 1,
    bodySize: theme.bodySize,
    bulletSize: theme.bodySize,
    bulletColor: palette.muted,
    bulletOpacity: 1,
    bulletGap: '0.75em'
  }, copy, {
    style: Object.assign({
      padding: 'clamp(1.2rem, 2vw, 2rem) 0'
    }, copy.style || {})
  })
}

function glitchTerminal (slide) {
  return function (target) {
    target.innerHTML = ''
    const root = frame('glitch-terminal')
    addStyle(root, sharedCss() + `
      .glitch-terminal {
        display: grid;
        align-items: center;
        background: ${background};
        color: ${palette.white};
        font-family: ${theme.font};
        padding: ${theme.padding};
      }
      .glitch-terminal::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 4px);
        mix-blend-mode: soft-light;
        pointer-events: none;
      }
      .glitch-terminal .talk-copy {
        position: relative;
        z-index: 1;
      }
      .glitch-terminal .talk-title {
        max-width: 11em;
        text-transform: uppercase;
        text-shadow: 0.06em 0 ${palette.pink}, -0.06em 0 ${palette.cyan}, 0 0 1.4rem rgba(255,255,255,0.34);
        animation: ps-glitch 2.8s infinite steps(2, end);
      }
      .glitch-terminal pre {
        margin: 2.1rem 0 0;
        max-width: min(50rem, 58vw);
        padding: clamp(1.2rem, 2.5vw, 2rem);
        border: 1px solid rgba(95,251,241,0.35);
        border-radius: ${theme.cardRadius};
        background: ${palette.panel};
        box-shadow: 0 0 2rem rgba(95,251,241,0.18), inset 0 0 2rem rgba(255,110,199,0.08);
        color: ${palette.cyan};
        font: 700 clamp(0.95rem, 1.12vw, 1.2rem)/1.55 ${theme.mono};
        white-space: pre-wrap;
      }
      .glitch-terminal .orb {
        position: absolute;
        width: min(18vw, 18rem);
        height: min(18vw, 18rem);
        border-radius: 50%;
        right: 8vw;
        bottom: 10vh;
        background: conic-gradient(from 0deg, ${palette.pink}, ${palette.cyan}, ${palette.yellow}, ${palette.pink});
        filter: blur(0.2rem) saturate(1.25);
        animation: ps-spin 7s linear infinite;
        opacity: 0.78;
      }
      @keyframes ps-glitch {
        0%, 86%, 100% { transform: translate(0); filter: hue-rotate(0deg); }
        88% { transform: translate(0.18em, -0.04em) skewX(7deg); filter: hue-rotate(60deg); }
        92% { transform: translate(-0.12em, 0.05em) skewX(-5deg); filter: hue-rotate(-45deg); }
      }
      @keyframes ps-spin { to { transform: rotate(1turn) scale(1.08); } }
    `)

    const copy = tag('section', '', 'talk-copy')
    copy.appendChild(tag('div', slide.eyebrow || 'Custom renderer', 'talk-eyebrow'))
    copy.appendChild(tag('h1', slide.title || 'Slides can run code', 'talk-title'))
    copy.appendChild(tag('p', slide.subtitle || 'Local DOM, CSS, and animation still share the same deck system.', 'talk-subtitle'))
    copy.appendChild(tag('pre', [
      '$ cat slides.yaml',
      '{ "type": "custom", "name": "glitchTerminal" }',
      '',
      '$ node talk.js',
      'renderers.glitchTerminal = live DOM + CSS + animation'
    ].join('\n')))
    root.appendChild(copy)
    root.appendChild(tag('div', '', 'orb'))
    target.appendChild(root)
  }
}

function particleField (slide) {
  return function (target) {
    target.innerHTML = ''
    const root = frame('particle-field')
    const canvas = document.createElement('canvas')
    const label = tag('section', [
      tag('div', slide.eyebrow || 'Canvas renderer', 'talk-eyebrow'),
      tag('h1', slide.title || 'Generative motion', 'talk-title'),
      tag('p', slide.subtitle || 'requestAnimationFrame in talk.js; no runtime deps', 'talk-subtitle')
    ], 'particle-label talk-panel')
    root.appendChild(canvas)
    root.appendChild(label)
    target.appendChild(root)

    const ctx = canvas.getContext('2d')
    const particles = Array.from({ length: 88 }, (_, i) => ({
      seed: i * 97,
      radius: 1 + (i % 7) * 0.45,
      hue: i % 3
    }))

    function resize () {
      canvas.width = window.innerWidth * window.devicePixelRatio
      canvas.height = window.innerHeight * window.devicePixelRatio
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0)
    }

    function draw (time) {
      if (!canvas.isConnected) return
      const width = window.innerWidth
      const height = window.innerHeight
      ctx.clearRect(0, 0, width, height)
      ctx.fillStyle = palette.void
      ctx.fillRect(0, 0, width, height)

      const gradient = ctx.createRadialGradient(width * 0.5, height * 0.45, 0, width * 0.5, height * 0.45, width * 0.65)
      gradient.addColorStop(0, 'rgba(95,251,241,0.18)')
      gradient.addColorStop(0.5, 'rgba(255,110,199,0.11)')
      gradient.addColorStop(1, 'rgba(17,9,30,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      particles.forEach(p => {
        const t = time * 0.00032 + p.seed
        const x = width * (0.5 + Math.sin(t * 1.7) * Math.cos(t * 0.37) * 0.42)
        const y = height * (0.5 + Math.cos(t * 1.31) * Math.sin(t * 0.29) * 0.38)
        const color = [palette.pink, palette.cyan, palette.yellow][p.hue]
        ctx.beginPath()
        ctx.fillStyle = color
        ctx.shadowBlur = 22
        ctx.shadowColor = color
        ctx.arc(x, y, p.radius, 0, Math.PI * 2)
        ctx.fill()
      })

      ctx.shadowBlur = 0
      window.requestAnimationFrame(draw)
    }

    addStyle(root, sharedCss() + `
      .particle-field {
        background: ${palette.void};
      }
      .particle-field canvas {
        position: absolute;
        inset: 0;
      }
      .particle-label {
        position: absolute;
        left: clamp(3.5rem, 7vw, 7rem);
        bottom: clamp(3rem, 7vh, 5.5rem);
        max-width: min(43rem, 52vw);
      }
      .particle-label .talk-title {
        font-size: clamp(2.8rem, 5.1vw, 5.4rem);
      }
    `)
    resize()
    window.addEventListener('resize', resize, { once: true })
    window.requestAnimationFrame(draw)
  }
}

function cssCascade (slide) {
  return function (target) {
    target.innerHTML = ''
    const root = frame('css-cascade')
    addStyle(root, sharedCss() + `
      .css-cascade {
        display: grid;
        place-items: center;
        padding: ${theme.columns.padding};
        background: ${background};
        font-family: ${theme.font};
      }
      .css-cascade .cascade-layout {
        width: ${theme.columns.width};
        max-width: 100%;
        display: grid;
        grid-template-columns: minmax(0, 0.9fr) minmax(26rem, 0.92fr);
        gap: clamp(2.2rem, 4.6vw, 4.8rem);
        align-items: center;
      }
      .css-cascade .cascade-header {
        max-width: 35rem;
      }
      .css-cascade .cascade-header .talk-title {
        font-size: clamp(3rem, 5vw, 5.6rem);
      }
      .css-cascade .cascade-header .talk-subtitle {
        max-width: 31em;
      }
      .css-cascade .ladder {
        position: relative;
        display: grid;
        gap: clamp(0.8rem, 1.25vw, 1.1rem);
        padding: clamp(0.85rem, 1.4vw, 1.2rem);
        border: 1px solid rgba(255,255,255,0.16);
        border-radius: calc(${theme.cardRadius} + 0.45rem);
        background: linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.035));
        box-shadow: ${theme.shadow}, inset 0 0 2.6rem rgba(95,251,241,0.07);
        overflow: hidden;
      }
      .css-cascade .step {
        position: relative;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: clamp(0.9rem, 1.6vw, 1.25rem);
        align-items: center;
        min-height: clamp(5.6rem, 10vh, 7.1rem);
        padding: clamp(0.9rem, 1.55vw, 1.25rem);
        border: 1px solid ${palette.line};
        border-radius: ${theme.cardRadius};
        background:
          linear-gradient(135deg, rgba(17,9,30,0.94), rgba(36,16,68,0.82)),
          radial-gradient(circle at 0% 0%, rgba(255,110,199,0.22), transparent 38%);
        box-shadow: 0 0.9rem 2.1rem rgba(0,0,0,0.22), inset 0 0 1.5rem rgba(255,255,255,0.035);
        transform: translateX(2rem);
        animation: ps-step-in 760ms cubic-bezier(.2,.8,.2,1) forwards;
      }
      .css-cascade .step:nth-child(2) { animation-delay: 120ms; }
      .css-cascade .step:nth-child(3) { animation-delay: 240ms; }
      .css-cascade .step::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(255,110,199,0.12), transparent 28%, rgba(95,251,241,0.11));
        pointer-events: none;
      }
      .css-cascade .marker {
        position: relative;
        z-index: 1;
        display: grid;
        place-items: center;
        width: clamp(3rem, 4.4vw, 3.8rem);
        height: clamp(3rem, 4.4vw, 3.8rem);
        border-radius: 999px;
        background: conic-gradient(from var(--angle), ${palette.pink}, ${palette.cyan}, ${palette.yellow}, ${palette.pink});
        color: ${palette.void};
        font: 950 clamp(1.2rem, 1.8vw, 1.55rem)/1 ${theme.mono};
        box-shadow: 0 0 1.4rem rgba(255,110,199,0.28);
        animation: ps-angle 5s linear infinite;
      }
      .css-cascade .step-copy {
        position: relative;
        z-index: 1;
        display: grid;
        gap: 0.28rem;
      }
      .css-cascade .label {
        color: ${palette.yellow};
        font: 800 clamp(0.72rem, 0.85vw, 0.88rem)/1.1 ${theme.mono};
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .css-cascade strong {
        color: ${palette.white};
        font: 900 clamp(1.45rem, 2.25vw, 2.28rem)/1.02 ${theme.font};
        letter-spacing: -0.045em;
      }
      .css-cascade span {
        color: ${palette.muted};
        font: 600 clamp(0.92rem, 1.05vw, 1.12rem)/1.35 ${theme.font};
      }
      .css-cascade .runway {
        display: flex;
        flex-wrap: wrap;
        gap: 0.55rem;
        margin-top: clamp(0.15rem, 0.5vw, 0.4rem);
      }
      .css-cascade code {
        display: inline-flex;
        align-items: center;
        min-height: 2rem;
        padding: 0.42rem 0.68rem;
        border: 1px solid rgba(95,251,241,0.25);
        border-radius: 999px;
        background: rgba(95,251,241,0.08);
        color: ${palette.cyan};
        font: 800 clamp(0.68rem, 0.78vw, 0.82rem)/1 ${theme.mono};
      }
      @property --angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
      @keyframes ps-angle { to { --angle: 360deg; } }
      @keyframes ps-step-in { to { opacity: 1; transform: translateX(0); } }
    `)

    const header = tag('section', [
      tag('div', slide.eyebrow || 'Authoring ladder', 'talk-eyebrow'),
      tag('h1', slide.title || 'Start simple, add code only when needed', 'talk-title'),
      tag('p', slide.subtitle || 'Most slides are just YAML. Custom JavaScript is optional. The CLI turns the folder into a static deck.', 'talk-subtitle')
    ], 'cascade-header')
    const ladder = tag('div', '', 'ladder')

    ;(slide.cards || [
      ['1 · slides.yaml', 'Write normal slides', 'Titles, bullets, images, video, and iframes stay as content.'],
      ['2 · talk.js', 'Add code for special moments', 'Only custom slides need DOM, canvas, or animation.'],
      ['3 · CLI', 'Build or preview the deck', 'Run dev while editing, then build static files to share.']
    ]).forEach((card, index) => {
      const match = String(card[0]).match(/^(\d+)\s*[·.]\s*(.+)$/)
      const stepNumber = match ? match[1] : String(index + 1)
      const stepLabel = match ? match[2] : card[0]
      const el = tag('section', [
        tag('div', stepNumber, 'marker'),
        tag('div', [
          tag('div', stepLabel, 'label'),
          tag('strong', card[1]),
          tag('span', card[2])
        ], 'step-copy')
      ], 'step')
      ladder.appendChild(el)
    })

    ladder.appendChild(tag('div', [
      tag('code', 'slides.yaml'),
      tag('code', '+ optional talk.js'),
      tag('code', 'power-slides build')
    ], 'runway'))

    const layout = tag('div', [header, ladder], 'cascade-layout')
    root.appendChild(layout)
    target.appendChild(root)
  }
}

function end (slide) {
  return function (target) {
    target.innerHTML = ''
    const root = frame('summary-slide')
    addStyle(root, sharedCss() + `
      .summary-slide {
        display: grid;
        place-items: center;
        padding: ${theme.columns.padding};
        background: ${background};
        color: ${palette.white};
        font-family: ${theme.font};
      }
      .summary-slide .talk-columns {
        width: ${theme.columns.width};
        max-width: 100%;
        display: grid;
        grid-template-columns: ${theme.columns.template};
        gap: ${theme.columns.gap};
        align-items: center;
      }
      .summary-slide .talk-copy {
        max-width: ${theme.columns.copyMaxWidth};
      }
      .summary-slide .talk-panel {
        width: 100%;
        max-width: ${theme.columns.panelMaxWidth};
        justify-self: center;
      }
      .summary-slide .talk-title {
        font-size: clamp(3rem, 5.4vw, 5.9rem);
      }
      .summary-slide ul {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 1rem;
      }
      .summary-slide li {
        position: relative;
        padding-left: 1.4rem;
        color: ${palette.muted};
        font-size: ${theme.bodySize};
        line-height: 1.45;
      }
      .summary-slide li::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0.68em;
        width: 0.45rem;
        height: 0.45rem;
        border-radius: 999px;
        background: ${palette.cyan};
        box-shadow: 0 0 1rem ${palette.cyan};
      }
      .summary-slide .pull {
        margin-top: 1.6rem;
        padding-left: 1rem;
        border-left: 0.22rem solid ${palette.yellow};
        color: ${palette.white};
        font-size: ${theme.subtitleSize};
        line-height: 1.35;
      }
    `)

    const columns = tag('div', null, 'talk-columns')
    columns.appendChild(tag('section', [
      tag('div', slide.eyebrow || 'Closing pattern', 'talk-eyebrow'),
      tag('h1', slide.title || 'Ship talks, not boilerplate', 'talk-title'),
      tag('p', slide.subtitle || 'Keep normal slides content-only, then reach for code when it earns the spectacle.', 'talk-subtitle')
    ], 'talk-copy'))

    columns.appendChild(tag('section', [
      tag('div', 'What this proves', 'talk-eyebrow'),
      tag('ul', [
        tag('li', 'slides.yaml drives normal slides'),
        tag('li', 'talk.js can render live DOM, canvas, and animation'),
        tag('li', 'external iframe slides can sit in an iPhone-like frame with parent slide copy')
      ]),
      tag('div', 'New talks stay content-only until JavaScript earns its keep.', 'pull')
    ], 'talk-panel'))

    root.appendChild(columns)
    target.appendChild(root)
  }
}

function sharedCss () {
  return `
    .talk-copy,
    .talk-panel {
      box-sizing: border-box;
    }
    .talk-panel {
      padding: clamp(1.5rem, 3vw, 2.8rem);
      border: 1px solid ${palette.line};
      border-radius: ${theme.cardRadius};
      background: ${palette.panel};
      box-shadow: ${theme.shadow};
      backdrop-filter: blur(10px);
    }
    .talk-eyebrow {
      margin: 0 0 1rem;
      color: ${palette.yellow};
      font: 800 ${theme.eyebrowSize}/1.1 ${theme.mono};
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .talk-title {
      margin: 0;
      max-width: ${theme.copyWidth};
      color: ${palette.white};
      font-size: ${theme.titleSize};
      font-weight: 900;
      line-height: 0.98;
      letter-spacing: -0.06em;
      text-wrap: balance;
    }
    .talk-subtitle {
      max-width: 38rem;
      margin: 1.15rem 0 0;
      color: ${palette.muted};
      font-size: ${theme.subtitleSize};
      font-weight: 650;
      line-height: 1.38;
      text-wrap: pretty;
    }
  `
}

function frame (className) {
  const root = tag('div', '', className)
  Object.assign(root.style, {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden'
  })
  return root
}

function addStyle (root, cssText) {
  const style = document.createElement('style')
  style.textContent = cssText
  root.appendChild(style)
}

function tag (name, children, className) {
  const el = document.createElement(name)
  if (className) el.className = className
  if (children == null) return el
  if (!Array.isArray(children)) children = [children]
  children.forEach(child => {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child))
    else if (child) el.appendChild(child)
  })
  return el
}
