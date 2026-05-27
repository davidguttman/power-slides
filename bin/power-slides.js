#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const yaml = require('js-yaml')

const packageRoot = path.resolve(__dirname, '..')
const esmifyRoot = resolveEsmifyRoot(packageRoot)
const defaultSlideSpecNames = ['slides.yaml', 'slides.yml', 'slides.json']

main().catch(function (err) {
  console.error(err.stack || err.message || err)
  process.exit(1)
})

async function main () {
  const argv = process.argv.slice(2)
  const command = argv.shift()

  if (!command || command === '--help' || command === '-h') return help()
  if (command === 'init') return init(argv)
  if (command === 'build') return build(argv)
  if (command === 'dev') return dev(argv)

  throw new Error('Unknown command: ' + command)
}

function help () {
  console.log(`power-slides <command>

Commands:
  init <dir>       Create a content-only talk folder
  build [dir]      Bundle a talk into public/index.html
  dev [dir]        Start budo dev server wiring for a talk

Options:
  --slides <file> Build/dev slide spec (default: slides.yaml, slides.yml, or slides.json)
  --out <dir>      Build/dev output directory (default: <talk>/public)
  --port <port>    Dev server port (default: $PORT, then 9966)
  --open           Open browser for dev server
  --force          Allow init into a non-empty directory
`)
}

function parseOptions (argv) {
  const opts = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--force') opts.force = true
    else if (arg === '--open') opts.open = true
    else if (arg === '--slides') opts.slides = argv[++i]
    else if (arg === '--out') opts.out = argv[++i]
    else if (arg === '--port') opts.port = argv[++i]
    else opts._.push(arg)
  }
  return opts
}

async function init (argv) {
  const opts = parseOptions(argv)
  const target = path.resolve(opts._[0] || '.')

  if (fs.existsSync(target) && !opts.force && fs.readdirSync(target).length > 0) {
    throw new Error('Refusing to init into non-empty directory without --force: ' + target)
  }

  mkdirp(target)
  mkdirp(path.join(target, 'assets'))
  mkdirp(path.join(target, 'public'))

  writeNew(path.join(target, 'slides.yaml'), yaml.dump(sampleSlides(), { lineWidth: -1, noRefs: true }))
  writeNew(path.join(target, 'talk.js'), sampleTalkJs())
  writeNew(path.join(target, 'assets', '.gitkeep'), '')
  writeNew(path.join(target, 'public', '.gitkeep'), '')
  writeNew(path.join(target, 'README.md'), sampleReadme())

  console.log('Created content-only talk at ' + target)
  console.log('Next: power-slides dev ' + target)
}

async function build (argv) {
  const opts = parseOptions(argv)
  const talkDir = path.resolve(opts._[0] || '.')
  const outDir = path.resolve(opts.out || path.join(talkDir, 'public'))
  const result = await buildTalk(talkDir, outDir, { minify: true, slides: opts.slides })
  console.log('Built ' + path.relative(process.cwd(), result.htmlPath))
  console.log('Bundled ' + path.relative(process.cwd(), result.bundlePath))
  return result
}

async function dev (argv) {
  const opts = parseOptions(argv)
  const talkDir = path.resolve(opts._[0] || '.')
  const outDir = path.resolve(opts.out || path.join(talkDir, 'public'))
  const entryPath = prepareEntry(talkDir, { slides: opts.slides })
  const serve = 'power-slides-dev.js'

  mkdirp(outDir)
  writeHtml(path.join(outDir, 'index.html'), serve, { title: readTalkTitle(talkDir, opts.slides) })

  const budoBin = path.join(packageRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'budo.cmd' : 'budo')
  const args = [entryPath, '--dir', outDir, '--serve', serve, '--live', '--port', String(opts.port || process.env.PORT || 9966)]
  if (opts.open) args.push('--open')
  args.push('--', '-p', '[', require.resolve('esmify'), '--basedir', esmifyRoot, ']', '-r', path.join(packageRoot, 'index.mjs') + ':power-slides')

  console.log('Starting budo for ' + talkDir)
  console.log('Serving ' + outDir)
  const child = spawn(budoBin, args, { stdio: 'inherit' })
  child.on('exit', code => process.exit(code || 0))
}

async function buildTalk (talkDir, outDir, opts) {
  opts = opts || {}
  mkdirp(outDir)
  const entryPath = prepareEntry(talkDir, { slides: opts.slides })
  const bundled = await bundle(entryPath)
  const code = opts.minify ? (await require('terser').minify(String(bundled))).code : String(bundled)
  if (!code) throw new Error('Terser produced an empty bundle')

  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 10)
  const scriptName = 'power-slides.' + hash + '.js'
  const bundlePath = path.join(outDir, scriptName)
  const htmlPath = path.join(outDir, 'index.html')

  fs.writeFileSync(bundlePath, code)
  writeHtml(htmlPath, scriptName, { title: readTalkTitle(talkDir, opts.slides) })

  return { htmlPath, bundlePath, scriptName }
}

function resolveEsmifyRoot (root) {
  const parts = path.resolve(root).split(path.sep)
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i] === 'node_modules') {
      const parent = parts.slice(0, i).join(path.sep)
      return parent || path.sep
    }
  }
  return root
}

function bundle (entryPath) {
  return new Promise(function (resolve, reject) {
    const browserify = require('browserify')
    const esmify = require('esmify')
    const b = browserify(entryPath, {
      debug: false,
      plugin: [[esmify, { basedir: esmifyRoot }]],
      basedir: path.dirname(entryPath)
    })
    b.require(path.join(packageRoot, 'index.mjs'), { expose: 'power-slides' })
    b.bundle(function (err, buf) {
      if (err) return reject(err)
      resolve(buf)
    })
  })
}

function prepareEntry (talkDir, opts) {
  opts = opts || {}
  const talkPath = path.join(talkDir, 'talk.js')

  const buildDir = path.join(talkDir, '.power-slides')
  mkdirp(buildDir)

  const result = readSlidesSpec(talkDir, opts.slides)
  const spec = result.spec
  const imports = ["import PowerSlides from 'power-slides'"]
  const talkImport = fs.existsSync(talkPath)
  if (talkImport) imports.push("import talkModule from '../talk.js'")

  const entry = `${imports.join('\n')}

const spec = ${JSON.stringify(spec, null, 2)}
const talk = ${talkImport ? 'talkModule' : '{}'}

window.document.body.style.cssText = (talk && talk.bodyStyle) || \`
  margin: 0;
  background: #000;
  overflow: hidden;
\`

if (talk && typeof talk.beforeStart === 'function') talk.beforeStart(PowerSlides, spec)
PowerSlides.startTalk(window.document.body, spec, { talk })
`

  const entryPath = path.join(buildDir, 'entry.js')
  fs.writeFileSync(entryPath, entry)
  return entryPath
}

function writeHtml (htmlPath, scriptName, opts) {
  opts = opts || {}
  const title = escapeHtml(opts.title || 'power-slides talk')
  fs.writeFileSync(htmlPath, `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body>
  <script src="./${scriptName}"></script>
</body>
</html>
`)
}

function readSlidesSpec (talkDir, explicitPath) {
  const slidesPath = resolveSlidesPath(talkDir, explicitPath)
  const source = fs.readFileSync(slidesPath, 'utf8')
  const ext = path.extname(slidesPath).toLowerCase()

  if (ext === '.json') return { spec: JSON.parse(source), path: slidesPath }
  if (ext === '.yml' || ext === '.yaml') return { spec: yaml.load(source), path: slidesPath }

  throw new Error('Unsupported slide spec extension for ' + slidesPath + ' (expected .yaml, .yml, or .json)')
}

function resolveSlidesPath (talkDir, explicitPath) {
  if (explicitPath) {
    const slidesPath = path.resolve(talkDir, explicitPath)
    if (!fs.existsSync(slidesPath)) throw new Error('Missing slide spec: ' + slidesPath)
    return slidesPath
  }

  const found = defaultSlideSpecNames
    .map(name => path.join(talkDir, name))
    .find(file => fs.existsSync(file))

  if (found) return found

  throw new Error('Missing slide spec in ' + talkDir + ' (expected slides.yaml, slides.yml, or slides.json)')
}

function readTalkTitle (talkDir, slidesPath) {
  try {
    const spec = readSlidesSpec(talkDir, slidesPath).spec
    const slides = Array.isArray(spec) ? spec : spec.slides || []
    const first = slides[0]
    if (first && typeof first === 'object') return first.title || first.text || first.quote || 'power-slides talk'
    if (typeof first === 'string') return first
  } catch (err) {}
  return 'power-slides talk'
}

function mkdirp (dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeNew (file, content) {
  if (fs.existsSync(file)) return
  fs.writeFileSync(file, content)
}

function escapeHtml (value) {
  return String(value).replace(/[&<>"']/g, function (ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  })
}

function sampleSlides () {
  return {
    slides: [
      {
        type: 'overlay',
        eyebrow: 'Your Name',
        title: 'A content-only talk',
        subtitle: 'slides.yaml + optional talk.js',
        background: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=1800&q=80',
        brightness: 0.55
      },
      {
        type: 'overlay',
        eyebrow: 'Big idea',
        title: 'Write content. Reuse the app.',
        subtitle: 'No copied package.json, public/index.html, lockfile, or bundler scripts.',
        notes: ['Slide notes show in presenter mode.']
      },
      {
        type: 'quote',
        quote: 'A slide can still be anything the browser can render.',
        image: 'https://placehold.co/900x600/png?text=asset+or+CDN+image',
        notes: ['Remote image preloading starts after slide 1 is already visible.']
      },
      {
        type: 'custom',
        name: 'spark',
        title: 'Custom JS when JSON is not enough',
        subtitle: 'talk.js can add local animation without changing the shared deck runtime.'
      },
      {
        type: 'iframe',
        srcdoc: '<!doctype html><html><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#13081f,#2d1b4e);color:white;font:24px system-ui"><main style="max-width:680px;padding:2rem"><h1>Iframe demo</h1><p>Click inside to capture focus. Parent-level corner arrows stay available for slide navigation.</p><input value="iframe focus"></main></body></html>',
        title: 'Custom embedded demo'
      },
      {
        type: 'custom',
        name: 'thanks',
        title: 'Thank you!'
      }
    ]
  }
}

function sampleTalkJs () {
  return `// Optional ESM escape hatch for custom slide rendering.
// You can delete this file if slides.yaml covers your whole talk.

export default {
  renderers: {
    spark (slide) {
      return function (target) {
        target.innerHTML = ''
        const root = document.createElement('div')
        root.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;display:grid;place-items:center;background:radial-gradient(circle at 20% 20%,#ff6ec766,transparent 28%),linear-gradient(135deg,#11091e,#2d1b4e);color:white;font-family:system-ui,sans-serif'
        root.innerHTML = '<style>@keyframes spin{to{transform:rotate(1turn)}}.spark-orb{position:absolute;width:34vmin;height:34vmin;border-radius:50%;background:conic-gradient(#ff6ec7,#5ffbf1,#f9f871,#ff6ec7);filter:blur(.15rem);animation:spin 6s linear infinite}.spark-copy{position:relative;z-index:1;max-width:58vw;padding:2rem;border:1px solid #ffffff38;border-radius:1.25rem;background:#0008;box-shadow:0 1rem 3rem #0008}.spark-copy h1{font-size:5vw;line-height:.95;margin:0 0 1rem;letter-spacing:-.06em}.spark-copy p{font-size:1.5vw;color:#d4a5ff}</style><div class="spark-orb"></div><div class="spark-copy"><h1></h1><p></p></div>'
        root.querySelector('h1').textContent = slide.title || 'Custom JS slide'
        root.querySelector('p').textContent = slide.subtitle || 'Rendered by talk.js'
        target.appendChild(root)
      }
    },
    thanks (slide, PS) {
      return PS.overlay({
        title: slide.title || 'Thank you!',
        subtitle: 'Questions?',
        brightness: 0.6
      })
    }
  }
}
`
}

function sampleReadme () {
  return `# Talk

This is a content-only power-slides talk.

- \`slides.yaml\` contains slide content.
- \`talk.js\` is optional ESM for custom renderers/escape hatches.
- \`public/\` is served at the web root for generated images, video, fonts, etc.
- \`assets/\` is for source assets you do not serve directly.

Run from anywhere with power-slides installed:

\`\`\`bash
power-slides dev .
power-slides build .
\`\`\`
`
}
