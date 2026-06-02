// Optional power-slides talk hooks.
//
// New decks can author most slides in slides.yaml. This file is the browser-code
// escape hatch for the rare slide that needs live DOM, canvas, animation, data,
// or any other custom behavior.

export default {
  // bodyStyle is an advanced JS escape hatch applied after slides.yaml top-level style.
  // It accepts CSS text or an object. Most decks should use slides.yaml style instead.
  // bodyStyle: 'margin:0;background:#000;color:white;overflow:hidden',

  // slides(slides, PS) can theme or transform the parsed slide array.
  // slides (slides, PS) {
  //   return slides.map(slide => Object.assign({ font: 'Inter, system-ui, sans-serif' }, slide))
  // },

  // renderers add named custom slides used by `custom`/`name`/`kind`/`renderer`.
  renderers: {
    particleField
  }

  // beforeStart(PS, spec) runs once after slides.yaml is parsed and before startTalk().
  // beforeStart (PS, spec) {
  //   console.log('Starting', Array.isArray(spec) ? spec.length : spec.slides.length, 'slides')
  // }
}

function particleField (slide) {
  return function renderParticleField (target) {
    target.innerHTML = ''

    const root = document.createElement('section')
    root.className = 'starter-particle-field'
    root.innerHTML = `
      <style>
        .starter-particle-field {
          position: relative;
          width: 100vw;
          height: 100vh;
          overflow: hidden;
          background:
            radial-gradient(circle at 75% 20%, rgba(95, 251, 241, 0.18), transparent 30%),
            linear-gradient(135deg, #061018, #1b0d31 58%, #05070b);
          color: white;
          font-family: Inter, system-ui, sans-serif;
        }
        .starter-particle-field canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
        .starter-particle-copy {
          position: absolute;
          left: clamp(1rem, 7vw, 7rem);
          bottom: clamp(1rem, 7vh, 6rem);
          width: min(43rem, calc(100vw - clamp(2rem, 10vw, 4rem)));
          max-height: calc(100vh - clamp(2rem, 10vw, 5.5rem));
          overflow: auto;
          padding: clamp(1.15rem, 4vw, 2rem);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: clamp(1.1rem, 4vw, 1.8rem);
          background: rgba(6, 16, 24, 0.68);
          box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.36);
          backdrop-filter: blur(14px);
        }
        .starter-particle-eyebrow {
          margin: 0 0 0.8rem;
          color: #5ffbf1;
          font-size: clamp(0.76rem, 1vw, 1rem);
          font-weight: 900;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .starter-particle-copy h1 {
          margin: 0;
          max-width: 10em;
          font-size: clamp(2.35rem, 10vw, 5.4rem);
          line-height: 0.92;
          letter-spacing: -0.07em;
        }
        .starter-particle-copy p {
          margin: 1rem 0 0;
          max-width: 34em;
          color: rgba(255,255,255,0.76);
          font-size: clamp(1rem, 3.8vw, 1.35rem);
          line-height: 1.45;
        }
      </style>
      <canvas aria-hidden="true"></canvas>
      <div class="starter-particle-copy">
        <div class="starter-particle-eyebrow"></div>
        <h1></h1>
        <p></p>
      </div>
    `

    root.querySelector('.starter-particle-eyebrow').textContent = slide.eyebrow || 'JavaScript escape hatch'
    root.querySelector('h1').textContent = slide.title || 'Canvas when the moment is worth it'
    root.querySelector('p').textContent = slide.subtitle || 'talk.js renders live browser code without giving up YAML authoring.'
    target.appendChild(root)

    const canvas = root.querySelector('canvas')
    const ctx = canvas.getContext('2d')
    const colors = ['#ff6ec7', '#5ffbf1', '#f9f871', '#8b9aff']
    const dots = Array.from({ length: 96 }, function (_, index) {
      return {
        seed: index * 83,
        radius: 1.4 + (index % 6) * 0.42,
        color: colors[index % colors.length]
      }
    })

    function resize () {
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(window.innerWidth * ratio)
      canvas.height = Math.floor(window.innerHeight * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    function draw (time) {
      if (!canvas.isConnected) return

      const width = window.innerWidth
      const height = window.innerHeight
      ctx.clearRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'lighter'

      dots.forEach(function (dot) {
        const t = time * 0.00028 + dot.seed
        const x = width * (0.5 + Math.sin(t * 1.7) * Math.cos(t * 0.41) * 0.43)
        const y = height * (0.48 + Math.cos(t * 1.33) * Math.sin(t * 0.31) * 0.4)
        ctx.beginPath()
        ctx.fillStyle = dot.color
        ctx.shadowColor = dot.color
        ctx.shadowBlur = 24
        ctx.arc(x, y, dot.radius, 0, Math.PI * 2)
        ctx.fill()
      })

      ctx.globalCompositeOperation = 'source-over'
      window.requestAnimationFrame(draw)
    }

    resize()
    window.addEventListener('resize', resize)
    window.requestAnimationFrame(draw)
  }
}
