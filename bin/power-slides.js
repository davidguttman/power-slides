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

  const budoBin = path.join(packageRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'budo.cmd' : 'budo')
  const args = [prepared.entryPath, '--dir', outDir, '--serve', serve, '--live', '--port', String(opts.port || process.env.PORT || 9966)]
  if (opts.open) args.push('--open')
  args.push('--', '-p', '[', require.resolve('esmify'), '--basedir', esmifyRoot, ']', '-r', path.join(packageRoot, 'index.mjs') + ':power-slides')

  console.log('power-slides v' + packageVersion + ' dev serving ' + talkDir)
  console.log('Starting budo for ' + talkDir)
  console.log('Serving ' + outDir)
  console.log('Watching ' + path.relative(talkDir, prepared.slidesPath))
  const child = spawn(budoBin, args, { stdio: 'inherit' })
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
    "import PowerSlides from 'power-slides'",
    "import spec from './slides.json'"
  ]
  const talkImport = fs.existsSync(talkPath)
  if (talkImport) imports.push("import talkModule from '../talk.js'")

  const entry = `${imports.join('\n')}

const talk = ${talkImport ? 'talkModule' : '{}'}

window.document.body.style.cssText = (talk && talk.bodyStyle) || \`
  margin: 0;
  background: #000;
  overflow: hidden;
\`

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
  <meta name="viewport" content="width=device-width, initial-scale=1">
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
  const slides = Array.isArray(spec) ? spec : (spec && spec.slides) || []
  const first = slides[0]
  if (first && typeof first === 'object') return first.title || first.text || first.quote || 'power-slides talk'
  if (typeof first === 'string') return first
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
  const exampleRoot = path.join(packageRoot, 'example')
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

This is a power-slides talk based on the packaged example starter. The content stays in \`slides.yaml\`, optional custom behavior stays in \`talk.js\`, and the local \`package.json\` lets npm-compatible runners install and run the talk.

## Files

- \`package.json\` installs the published \`power-slides\` package as a dev dependency and exposes runner-friendly npm scripts.
- \`slides.yaml\` contains slide content and presenter notes.
- \`talk.js\` is optional ESM for theming, custom renderers, and escape hatches.
- \`public/\` is served at the web root for example media, generated images, video, fonts, etc.
- \`assets/\` is for source assets you do not serve directly.

Install once, then run with npm scripts:

\`\`\`bash
npm install
npm run dev
npm run build
\`\`\`

The scripts call the \`powerslides\` bin alias:

\`\`\`json
{
  "scripts": {
    "dev": "powerslides dev .",
    "build": "powerslides build .",
    "start": "npm run dev"
  }
}
\`\`\`

## Options and remote control

The generated dev/build shell enables the power-slides Options overlay by default. Press \`o\` to reopen Options after the button fades. Click **Enable remote control** to start PeerJS, then scan the QR code or open the shown URL on your phone/controller.

To disable the shell remote UI, export \`remote: false\` from \`talk.js\` or set top-level \`remote: false\` in \`slides.yaml\`/JSON. To override PeerJS/runtime options, use \`remote: { ... }\`.

## Authoring schema quick reference

The talk file is a YAML object with a \`slides\` array. If a slide omits \`type\`, it renders as \`overlay\`. Every slide may include \`notes\` or \`note\` for presenter mode. \`renderer\`, \`name\`, or \`kind\` selects a \`talk.js\` renderer before built-ins.

Built-in slide types:

- \`overlay\` — normal copy slide. Fields: \`eyebrow\`, \`title\`/\`text\`, \`subtitle\`, \`background\`/\`image\`/\`src\`, \`brightness\`, \`align\`, \`font\`, \`color\`, \`backgroundColor\`, \`padding\`, \`maxWidth\`, \`titleSize\`, \`subtitleSize\`, \`subtitleOpacity\`, \`subtitleMaxWidth\`, \`eyebrowSize\`, \`backgroundSize\`, \`backgroundPosition\`.
- \`title\` — simple centered title. Fields: \`title\`/\`text\`/\`quote\`, \`style\`.
- \`image\` — full-slide image. Fields: \`src\`/\`img\`/\`image\`/\`background\`, \`fit\`/\`size\` (\`cover\` or \`contain\`).
- \`video\` — full-slide video. Fields: \`src\`/\`video\`, \`controls\`, \`muted\`, \`loop\`, \`autoplay\`, \`preload\`, \`poster\`, \`size\`.
- \`quote\` — quote/text plus optional image column. Fields: \`quote\`/\`text\`, \`eyebrow\`, \`image\`/\`img\`/\`src\`, \`background\`, \`brightness\`, \`font\`, \`color\`, \`size\`, layout knobs \`columns\`/\`gridTemplateColumns\`, \`rows\`/\`gridTemplateRows\`, \`gap\`, \`padding\`, \`alignItems\`, \`justifyItems\`, copy knobs \`align\`/\`copyAlign\`, \`copyJustify\`, \`copyAlignSelf\`, \`copyMaxWidth\`, \`copyStyle\`, and image knobs \`fit\`, \`maxHeight\`/\`imageMaxHeight\`, \`maxWidth\`/\`imageMaxWidth\`, \`radius\`, \`shadow\`, \`imageAlign\`, \`imageJustify\`, \`imageAlignSelf\`, \`imageJustifySelf\`, \`mediaStyle\`, \`imageStyle\`.
- \`chart\` — quote-style chart/screenshot slide. Same fields as \`quote\`; image aliases become the chart image and quote layout overrides still apply.
- \`summary\` — recap with right-side card. Fields: \`eyebrow\`, \`title\`/\`quote\`, \`background\`, \`brightness\`, \`font\`, \`color\`, \`accent\`, \`card.title\`, \`card.bullets\`, \`card.pull\`.
- \`iframe\` — external URL or \`srcdoc\`. Fields: \`src\`/\`url\`, \`srcdoc\`, \`title\`, \`allow\`, \`allowFullscreen\`, \`loading\`, \`referrerPolicy\`, \`sandbox\`, \`navigationControls\`, \`forwardKeys\`, \`background\`, \`iframeStyle\`, \`stagePadding\`/\`rootPadding\`. Phone frame: \`device: iphone\` or \`frame: phone\`, plus \`deviceWidth\`/\`frameWidth\`, \`deviceAspectRatio\`, \`devicePadding\`, \`deviceBorder\`, \`deviceRadius\`, \`deviceBackground\`, \`deviceShadow\`, \`deviceStyle\`, \`screenRadius\`, \`screenBackground\`. Side-copy layout: \`layout\`/\`phoneLayout\` (\`phone-right\` or \`phone-left\`), \`layoutWidth\`, \`layoutMaxWidth\`, \`layoutGap\`, \`layoutPadding\`, \`layoutStyle\`, and \`side\` with \`eyebrow\`, \`title\`, \`subtitle\`, \`body\`/\`text\`, \`bullets\`, \`position\`/\`side\`, \`color\`, \`font\`, \`accent\`, \`maxWidth\`, \`style\`, plus \`eyebrowColor\`, \`eyebrowSize\`, \`titleColor\`, \`titleSize\`, \`subtitleColor\`, \`subtitleSize\`, \`bodyColor\`, \`bodySize\`, \`bulletColor\`, \`bulletSize\`, \`bulletGap\` and matching weight/opacity/letter-spacing knobs. Arrow styling: \`navControlInset\`, \`navControlSize\`, \`navControlOpacity\`.
- \`html\` — trusted raw markup. Fields: \`html\`/\`markup\`.
- \`custom\` — render with \`talk.js\`. Fields: \`name\`/\`kind\`/\`renderer\`; all other fields pass through.

## Custom renderers in talk.js

\`talk.js\` exports an object. Use \`renderers\` for named custom slides, \`slides(slides, PS)\` to theme/transform all parsed slides, \`bodyStyle\` for page CSS, and \`beforeStart(PS, spec)\` for setup.

\`\`\`js
export default {
  bodyStyle: 'margin:0;background:#000;color:white;overflow:hidden',
  renderers: {
    demo (slide, PS) {
      return PS.overlay({
        title: slide.title || 'Demo',
        subtitle: 'Rendered by talk.js'
      })
    }
  }
}
\`\`\`

See the package README for the longer reference and more examples.
`
}
