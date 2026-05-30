#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const yaml = require('js-yaml')

const packageRoot = path.resolve(__dirname, '..')
const packageInfo = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'))
const packageVersion = packageInfo.version || '0.0.0'
const esmifyRoot = resolveEsmifyRoot(packageRoot)
const defaultSlideSpecNames = ['slides.yaml', 'slides.yml', 'slides.json']
const peerScriptName = 'peerjs.min.js'
const viewportMetaContent = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover'

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
  copyExampleStarter(target)
  mkdirp(path.join(target, 'assets'))
  mkdirp(path.join(target, 'public'))
  writeNew(path.join(target, 'package.json'), samplePackageJson(target))
  writeNew(path.join(target, 'README.md'), sampleReadme())

  console.log('Created power-slides talk at ' + target)
  console.log('Next: cd ' + target + ' && npm install && npm run dev')
}

async function build (argv) {
  const opts = parseOptions(argv)
  const talkDir = path.resolve(opts._[0] || '.')
  const outDir = path.resolve(opts.out || path.join(talkDir, 'public'))
  console.log('power-slides v' + packageVersion + ' building ' + talkDir)
  const result = await buildTalk(talkDir, outDir, { minify: true, slides: opts.slides })
  console.log('Built ' + path.relative(process.cwd(), result.htmlPath))
  console.log('Bundled ' + path.relative(process.cwd(), result.bundlePath))
  return result
}

async function dev (argv) {
  const opts = parseOptions(argv)
  const talkDir = path.resolve(opts._[0] || '.')
  const outDir = path.resolve(opts.out || path.join(talkDir, 'public'))
  const prepared = prepareEntry(talkDir, { slides: opts.slides })
  const serve = 'power-slides-dev.js'
  const htmlPath = path.join(outDir, 'index.html')

  mkdirp(outDir)
  copyPeerScript(outDir)
  writeHtml(htmlPath, serve, { title: titleFromSpec(prepared.spec), scripts: [peerScriptName] })

  const watcher = watchSlideSpec(prepared.slidesPath, function () {
    try {
      const next = prepareEntry(talkDir, { slides: opts.slides })
      copyPeerScript(outDir)
      writeHtml(htmlPath, serve, { title: titleFromSpec(next.spec), scripts: [peerScriptName] })
      console.log('Regenerated power-slides entry from ' + path.relative(talkDir, next.slidesPath))
    } catch (err) {
      console.error('Failed to regenerate power-slides entry:')
      console.error(err.stack || err.message || err)
    }
  })

  const budoScript = require.resolve('budo/bin/cmd.js')
  const args = [budoScript, prepared.entryPath, '--dir', outDir, '--serve', serve, '--live', '--port', String(opts.port || process.env.PORT || 9966)]
  if (opts.open) args.push('--open')
  args.push('--', '-p', '[', require.resolve('esmify'), '--basedir', esmifyRoot, ']', '-r', path.join(packageRoot, 'index.mjs') + ':power-slides')

  console.log('power-slides v' + packageVersion + ' dev serving ' + talkDir)
  console.log('Starting budo for ' + talkDir)
  console.log('Serving ' + outDir)
  console.log('Watching ' + path.relative(talkDir, prepared.slidesPath))
  const child = spawn(process.execPath, args, { stdio: 'inherit' })
  child.on('exit', code => {
    watcher.close()
    process.exit(code || 0)
  })
}

async function buildTalk (talkDir, outDir, opts) {
  opts = opts || {}
  mkdirp(outDir)
  const prepared = prepareEntry(talkDir, { slides: opts.slides })
  const bundled = await bundle(prepared.entryPath)
  const code = opts.minify ? (await require('terser').minify(String(bundled))).code : String(bundled)
  if (!code) throw new Error('Terser produced an empty bundle')

  const hash = crypto.createHash('sha256').update(code).digest('hex').slice(0, 10)
  const scriptName = 'power-slides.' + hash + '.js'
  const bundlePath = path.join(outDir, scriptName)
  const htmlPath = path.join(outDir, 'index.html')

  fs.writeFileSync(bundlePath, code)
  copyPeerScript(outDir)
  writeHtml(htmlPath, scriptName, { title: titleFromSpec(prepared.spec), scripts: [peerScriptName] })

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
  const slidesDataPath = path.join(buildDir, 'slides.json')
  writeFileChanged(slidesDataPath, serializeSpec(spec))

  const imports = [
    "import PowerSlides, { applyStyle, mergeStyle } from 'power-slides'",
    "import spec from './slides.json'"
  ]
  const talkImport = fs.existsSync(talkPath)
  if (talkImport) imports.push("import talkModule from '../talk.js'")

  const entry = `${imports.join('\n')}

const talk = ${talkImport ? 'talkModule' : '{}'}

const deckStyle = spec && !Array.isArray(spec) && spec.style

// Body style precedence: keep the hard runtime baseline, then apply
// slides.yaml top-level style as the normal deck theming path, then let
// talk.js bodyStyle win as the JS escape hatch for existing decks.
applyStyle(window.document.body.style, mergeStyle({
  margin: 0,
  background: '#000',
  overflow: 'hidden'
}, deckStyle, talk && talk.bodyStyle))

if (talk && typeof talk.beforeStart === 'function') talk.beforeStart(PowerSlides, spec)

const remote = talk && Object.prototype.hasOwnProperty.call(talk, 'remote')
  ? talk.remote
  : (spec && Object.prototype.hasOwnProperty.call(spec, 'remote') ? spec.remote : true)
const remoteOptions = remote === false
  ? false
  : (remote && typeof remote === 'object' ? remote : true)

PowerSlides.startTalk(window.document.body, spec, { talk, remote: remoteOptions })
`

  const entryPath = path.join(buildDir, 'entry.js')
  writeFileChanged(entryPath, entry)
  return { entryPath, slidesDataPath, slidesPath: result.path, spec }
}

function watchSlideSpec (slidesPath, onChange) {
  const dir = path.dirname(slidesPath)
  const basename = path.basename(slidesPath)
  let timer = null

  const watcher = fs.watch(dir, function (event, filename) {
    if (filename && String(filename) !== basename) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(function () {
      timer = null
      onChange()
    }, 75)
  })

  return {
    close () {
      if (timer) clearTimeout(timer)
      watcher.close()
    }
  }
}

function serializeSpec (spec) {
  const json = JSON.stringify(spec, null, 2)
  return (json === undefined ? 'null' : json) + '\n'
}

function writeFileChanged (file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return
  fs.writeFileSync(file, content)
}

function writeHtml (htmlPath, scriptName, opts) {
  opts = opts || {}
  const title = escapeHtml(opts.title || 'power-slides talk')
  const scripts = (opts.scripts || []).concat(scriptName).map(function (name) {
    return '  <script src="./' + escapeHtml(name) + '"></script>'
  }).join('\n')
  fs.writeFileSync(htmlPath, `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="${escapeHtml(viewportMetaContent)}">
  <title>${title}</title>
</head>
<body>
${scripts}
</body>
</html>
`)
}

function copyPeerScript (outDir) {
  fs.copyFileSync(require.resolve('peerjs/dist/peerjs.min.js'), path.join(outDir, peerScriptName))
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

function titleFromSpec (spec) {
  if (spec && !Array.isArray(spec) && typeof spec === 'object' && spec.title) return spec.title
  const slides = Array.isArray(spec) ? spec : (spec && spec.slides) || []
  for (const slide of slides) {
    if (typeof slide === 'string' && slide) return slide
    if (slide && typeof slide === 'object') {
      if (slide.title) return slide.title
      if (slide.text) return slide.text
    }
  }
  return 'power-slides talk'
}

function mkdirp (dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function writeNew (file, content) {
  if (fs.existsSync(file)) return
  fs.writeFileSync(file, content)
}

function copyExampleStarter (target) {
  const exampleRoot = path.join(packageRoot, 'examples', 'starter')
  copyTreeNew(exampleRoot, target, exampleRoot)
}

function copyTreeNew (source, target, root) {
  const stat = fs.statSync(source)
  const relative = path.relative(root, source)
  if (relative && shouldSkipExampleStarterPath(relative, stat)) return

  if (stat.isDirectory()) {
    mkdirp(target)
    for (const entry of fs.readdirSync(source)) {
      copyTreeNew(path.join(source, entry), path.join(target, entry), root)
    }
    return
  }

  if (!stat.isFile()) return
  if (fs.existsSync(target)) return
  mkdirp(path.dirname(target))
  fs.copyFileSync(source, target)
}

function shouldSkipExampleStarterPath (relative, stat) {
  const normalized = relative.split(path.sep).join('/')
  const basename = path.basename(normalized)

  if (basename === '.DS_Store' || basename.startsWith('._')) return true
  if (normalized === '.power-slides' || normalized.startsWith('.power-slides/')) return true
  if (normalized === 'node_modules' || normalized.startsWith('node_modules/')) return true

  if (stat.isFile()) {
    if (/^(package(?:-lock)?|npm-shrinkwrap)\.json$/.test(basename)) return true
    if (/^(yarn|pnpm)-lock\.yaml$/.test(basename)) return true
    if (normalized === 'public/index.html') return true
    if (normalized === 'public/peerjs.min.js') return true
    if (/^public\/power-slides\.[a-f0-9]+\.js$/.test(normalized)) return true
  }

  return false
}

function samplePackageJson (target) {
  return JSON.stringify({
    name: safePackageName(path.basename(target) || 'power-slides-talk'),
    private: true,
    scripts: {
      dev: 'powerslides dev .',
      build: 'powerslides build .',
      start: 'npm run dev'
    },
    devDependencies: {
      'power-slides': '^' + packageVersion
    }
  }, null, 2) + '\n'
}

function safePackageName (name) {
  const safe = String(name)
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9._~-]+/g, '-')
    .replace(/^[._~-]+|[._~-]+$/g, '')
    .slice(0, 214)

  if (safe && !safe.startsWith('.') && !safe.startsWith('_')) return safe
  return 'power-slides-talk'
}

function escapeHtml (value) {
  return String(value).replace(/[&<>"']/g, function (ch) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
  })
}

function sampleReadme () {
  return `# Talk

This is a minimal power-slides talk starter. Write deck content in \`slides.yaml\`, custom slide code in \`talk.js\`, and put images, video, and other static files in \`public/\`.

## Files

- \`slides.yaml\` — your deck content
- \`talk.js\` — optional browser code for custom slides
- \`public/\` — media and static files served by the deck

## Run and build

\`\`\`bash
npx power-slides dev .
npx power-slides build .
\`\`\`

Deploy the \`public/\` folder to any static host.

## Edit slides.yaml

Start with a YAML list. Each item is one slide.

\`\`\`yaml
- title: Your first deck
  subtitle: Plain content in slides.yaml. Press o for remote control.
  background: /sample.svg

- image: /sample.svg
  fit: contain

- video: /fractal-loop.mp4
  controls: true
  muted: true
  loop: true

- background: /sample.svg
  columns:
    - image: /sample.svg
      fit: contain
    - title: Composition is the model
      bullets:
        - Columns hold slide-shaped things
        - Images, copy, and embeds stay separate
\`\`\`

The starter also shows text, image, video, columns, iframe, html, and custom slides.

Each slide can have one of the following:

- \`title\` — words on screen
- \`image\` — a full-slide image
- \`video\` — a full-slide video
- \`iframe\` — a web page embed
- \`html\` — trusted inline markup
- \`custom\` — a named renderer from \`talk.js\`

To combine types, use \`columns\`, such as iframe-plus-copy or image-plus-title.

For the full slide schema and \`talk.js\` API, see the package README and \`docs/slide-api.md\`.

## Theming and deck metadata

For deck-wide metadata or CSS defaults, wrap the same slide list in a deck object with \`title\`, \`style\`, and \`slides\`.

## Remote control

Run or build the deck, press \`o\` to open Options, click **Enable remote control**, then scan the QR code or open the shown URL on your phone.

The phone remote navigates the deck.

## Optional talk.js

Use \`talk.js\` for slides that need browser code.

\`\`\`js
export default {
  renderers: {
    demo (slide, PS) {
      return PS.text({
        title: slide.title || 'Demo',
        subtitle: 'Rendered by talk.js'
      })
    }
  }
}
\`\`\`

Then reference the renderer from YAML:

\`\`\`yaml
- custom: demo
  title: Browser-native slide
\`\`\`

For more custom-renderer examples, see \`examples/showcase/\` in the power-slides package.

## Advanced: npm runners

The generated \`package.json\` is there for hosts, CI, or runners that expect npm scripts:

\`\`\`bash
npm install
npm run dev
npm run build
\`\`\`

Use those scripts for hosts, CI, or deploy flows that run npm commands.

`
}
