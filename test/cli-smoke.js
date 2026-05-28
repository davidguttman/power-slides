const fs = require('fs')
const os = require('os')
const path = require('path')
const assert = require('assert')
const yaml = require('js-yaml')
const { execFileSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const cli = path.join(root, 'bin', 'power-slides.js')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'power-slides-'))
const talk = path.join(tmp, 'talk')

function runCliWithBlockedBuildDeps (args) {
  const script = `
const Module = require('module')
const blocked = new Set(['browserify', 'budo', 'esmify', 'terser'])
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (blocked.has(request)) throw new Error('unexpected build/dev dependency before command dispatch: ' + request)
  return originalLoad.apply(this, arguments)
}
process.argv = [process.execPath, ${JSON.stringify(cli)}, ...${JSON.stringify(args)}]
require(${JSON.stringify(cli)})
`
  return execFileSync(process.execPath, ['-e', script], { encoding: 'utf8' })
}

function runDevWatchSmoke (talkDir) {
  const updatedSlides = [
    'slides:',
    '  - type: overlay',
    '    title: Watched title',
    '    subtitle: Updated YAML',
    ''
  ].join('\n')
  const script = `
const EventEmitter = require('events')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const cli = ${JSON.stringify(cli)}
const talkDir = ${JSON.stringify(talkDir)}
let spawnArgs = null
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'child_process') {
    return {
      spawn (bin, args) {
        spawnArgs = args
        return new EventEmitter()
      }
    }
  }
  return originalLoad.apply(this, arguments)
}
process.argv = [process.execPath, cli, 'dev', talkDir, '--port', '9876']
require(cli)
if (!spawnArgs) throw new Error('dev did not spawn budo')
if (path.basename(spawnArgs[0]) !== 'entry.js') throw new Error('dev entry arg is not generated entry.js: ' + spawnArgs[0])
if (path.basename(path.dirname(spawnArgs[0])) !== '.power-slides') throw new Error('dev entry is not in .power-slides: ' + spawnArgs[0])
setTimeout(function () {
  fs.writeFileSync(path.join(talkDir, 'slides.yaml'), ${JSON.stringify(updatedSlides)})
}, 100)
const deadline = Date.now() + 3000
function check () {
  const entry = fs.readFileSync(path.join(talkDir, '.power-slides', 'entry.js'), 'utf8')
  const html = fs.readFileSync(path.join(talkDir, 'public', 'index.html'), 'utf8')
  const spec = JSON.parse(fs.readFileSync(path.join(talkDir, '.power-slides', 'slides.json'), 'utf8'))
  if (spec.slides && spec.slides[0] && spec.slides[0].title === 'Watched title' && html.includes('<title>Watched title</title>')) {
    if (!entry.includes("import spec from './slides.json'")) throw new Error('entry does not import slides.json')
    if (!entry.includes('remote: remoteOptions')) throw new Error('entry does not enable remote options')
    if (!html.includes('<script src="./peerjs.min.js"></script>')) throw new Error('HTML does not load bundled PeerJS before the deck')
    if (entry.includes('Watched title') || entry.includes('Updated YAML')) throw new Error('entry contains baked watched slide content')
    process.exit(0)
  }
  if (Date.now() > deadline) {
    throw new Error('dev watcher did not regenerate slides.json and HTML title in time')
  }
  setTimeout(check, 50)
}
check()
`
  return execFileSync(process.execPath, ['-e', script], { encoding: 'utf8', stdio: 'pipe' })
}

const help = runCliWithBlockedBuildDeps(['--help'])
assert(help.includes('Dev server port (default: $PORT, then 9966)'), 'help documents $PORT dev port fallback')
assert(help.includes('default: slides.yaml, slides.yml, or slides.json'), 'help documents YAML default lookup order')

const packageReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
assert(packageReadme.includes('Built-in slide type reference'), 'package README has slide type reference')
for (const type of ['overlay', 'title', 'image', 'video', 'quote', 'chart', 'summary', 'iframe', 'html', 'custom']) {
  assert(packageReadme.includes('`' + type + '`'), 'package README documents ' + type + ' slide type')
}
assert(packageReadme.includes('deviceWidth') && packageReadme.includes('navControlOpacity'), 'package README documents iframe detail fields')
assert(packageReadme.includes('copyMaxWidth') && packageReadme.includes('gridTemplateColumns') && packageReadme.includes('gridTemplateRows') && packageReadme.includes('mediaStyle') && packageReadme.includes('imageStyle'), 'package README documents quote/chart layout override fields')
assert(packageReadme.includes('slides(slides, PS)') && packageReadme.includes('renderers'), 'package README documents talk.js hooks')
assert(packageReadme.includes('npm install') && packageReadme.includes('npm run dev') && packageReadme.includes('powerslides dev .'), 'package README documents npm install/scripts flow')
assert(packageReadme.includes('bundled PeerJS runtime') && packageReadme.includes('remote: false') && packageReadme.includes('Enable remote control'), 'package README documents CLI remote/options defaults')

runCliWithBlockedBuildDeps(['init', talk])

assert(fs.existsSync(path.join(talk, 'slides.yaml')), 'init writes slides.yaml')
assert(!fs.existsSync(path.join(talk, 'slides.yml')), 'init does not write slides.yml by default')
assert(!fs.existsSync(path.join(talk, 'slides.json')), 'init does not write slides.json by default')
assert(fs.existsSync(path.join(talk, 'talk.js')), 'init writes optional talk.js')
assert(fs.existsSync(path.join(talk, 'assets')), 'init creates assets convention')
assert(fs.existsSync(path.join(talk, 'public')), 'init creates public convention')
const initializedReadme = fs.readFileSync(path.join(talk, 'README.md'), 'utf8')
for (const type of ['overlay', 'title', 'image', 'video', 'quote', 'chart', 'summary', 'iframe', 'html', 'custom']) {
  assert(initializedReadme.includes('`' + type + '`'), 'generated talk README documents ' + type + ' slide type')
}
assert(initializedReadme.includes('Custom renderers in talk.js'), 'generated talk README documents custom renderers')
assert(initializedReadme.includes('deviceWidth') && initializedReadme.includes('navControlOpacity'), 'generated talk README documents iframe detail fields')
assert(initializedReadme.includes('copyMaxWidth') && initializedReadme.includes('gridTemplateColumns') && initializedReadme.includes('gridTemplateRows') && initializedReadme.includes('mediaStyle') && initializedReadme.includes('imageStyle'), 'generated talk README documents quote/chart layout override fields')
assert(initializedReadme.includes('npm install') && initializedReadme.includes('npm run dev') && initializedReadme.includes('powerslides dev .'), 'generated talk README documents npm scripts flow')
assert(initializedReadme.includes('Options and remote control') && initializedReadme.includes('remote: false') && initializedReadme.includes('Enable remote control'), 'generated talk README documents remote/options controls')

assert(fs.existsSync(path.join(talk, 'package.json')), 'init writes package.json')
const initializedPackage = JSON.parse(fs.readFileSync(path.join(talk, 'package.json'), 'utf8'))
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
assert.strictEqual(initializedPackage.name, 'talk', 'init derives safe package name from target directory')
assert.strictEqual(initializedPackage.private, true, 'init marks talk package private')
assert.deepStrictEqual(initializedPackage.scripts, {
  dev: 'powerslides dev .',
  build: 'powerslides build .',
  start: 'npm run dev'
}, 'init writes runner-friendly powerslides npm scripts')
assert.deepStrictEqual(initializedPackage.devDependencies, {
  'power-slides': '^' + rootPackage.version
}, 'init writes devDependency on current power-slides package version')
assert(!fs.existsSync(path.join(talk, 'package-lock.json')), 'init does not copy lockfile')
assert(!fs.existsSync(path.join(talk, 'node_modules')), 'init does not copy node_modules')
assert(!fs.existsSync(path.join(talk, '.power-slides')), 'init does not copy generated entry directory')
assert(!fs.existsSync(path.join(talk, 'public', 'index.html')), 'init does not copy generated public index')
assert(!fs.readdirSync(path.join(talk, 'public')).some(name => /^power-slides\.[a-f0-9]+\.js$/.test(name)), 'init does not copy generated public bundle')

const exampleSlidesSource = fs.readFileSync(path.join(root, 'example', 'slides.yaml'), 'utf8')
const exampleTalkSource = fs.readFileSync(path.join(root, 'example', 'talk.js'), 'utf8')
assert.strictEqual(fs.readFileSync(path.join(talk, 'slides.yaml'), 'utf8'), exampleSlidesSource, 'init copies packaged example slides.yaml')
assert.strictEqual(fs.readFileSync(path.join(talk, 'talk.js'), 'utf8'), exampleTalkSource, 'init copies packaged example talk.js')
for (const media of ['fist-bump.gif', 'multipass.gif', 'spin.mp4']) {
  assert.deepStrictEqual(
    fs.readFileSync(path.join(talk, 'public', media)),
    fs.readFileSync(path.join(root, 'example', 'public', media)),
    'init copies example public media ' + media
  )
}

const initializedSpec = yaml.load(fs.readFileSync(path.join(talk, 'slides.yaml'), 'utf8'))
const exampleSpec = yaml.load(exampleSlidesSource)
assert.deepStrictEqual(initializedSpec, exampleSpec, 'init slides parse identically to packaged example')
assert(!Object.prototype.hasOwnProperty.call(initializedSpec, 'title'), 'init example has no top-level title metadata')
assert.strictEqual(initializedSpec.slides[0].title, 'Content-only talks', 'init example uses first slide as title slide')
assert.strictEqual(initializedSpec.slides[0].subtitle, 'slides.yaml + optional ESM talk.js', 'init example advertises YAML by default')
const initializedIframe = initializedSpec.slides.find(slide => slide.type === 'iframe')
assert(initializedIframe, 'init example includes an iframe slide')
assert.strictEqual(initializedIframe.src, 'https://david.app/', 'init example iframe embeds david.app as an external URL')
assert.strictEqual(initializedIframe.device, 'iphone', 'init example uses the reusable iPhone device frame')
assert.strictEqual(initializedIframe.layout, 'phone-right', 'init example demonstrates phone plus side-copy layout')
assert(initializedIframe.side && initializedIframe.side.title && initializedIframe.side.bullets.length, 'init example includes reusable side copy')
assert(!initializedIframe.srcdoc, 'init example iframe is a real external iframe, not srcdoc')
assert(!initializedIframe.hint, 'init example does not render distracting text hint copy')

const nonEmpty = path.join(tmp, 'non-empty')
fs.mkdirSync(nonEmpty)
fs.writeFileSync(path.join(nonEmpty, 'keep.txt'), 'keep')
assert.throws(() => execFileSync(process.execPath, [cli, 'init', nonEmpty], { stdio: 'pipe' }), /Refusing to init into non-empty directory/, 'init refuses non-empty dirs without --force')
fs.writeFileSync(path.join(nonEmpty, 'slides.yaml'), 'custom slides')
const customPackageJson = '{\n  "name": "custom-talk"\n}\n'
fs.writeFileSync(path.join(nonEmpty, 'package.json'), customPackageJson)
execFileSync(process.execPath, [cli, 'init', nonEmpty, '--force'], { stdio: 'pipe' })
assert.strictEqual(fs.readFileSync(path.join(nonEmpty, 'slides.yaml'), 'utf8'), 'custom slides', 'init --force does not overwrite existing files')
assert.strictEqual(fs.readFileSync(path.join(nonEmpty, 'package.json'), 'utf8'), customPackageJson, 'init --force preserves existing package.json')
assert.strictEqual(fs.readFileSync(path.join(nonEmpty, 'keep.txt'), 'utf8'), 'keep', 'init --force preserves unrelated existing files')
assert(fs.existsSync(path.join(nonEmpty, 'talk.js')), 'init --force fills missing example files')

assert(!Object.prototype.hasOwnProperty.call(exampleSpec, 'title'), 'example has no top-level title metadata')
assert.strictEqual(exampleSpec.slides[0].title, 'Content-only talks', 'example uses first slide as title slide')
const exampleIframe = exampleSpec.slides.find(slide => slide.type === 'iframe')
assert(exampleIframe, 'example includes an iframe slide')
assert.strictEqual(exampleIframe.src, 'https://david.app/', 'example iframe embeds david.app as an external URL')
assert.strictEqual(exampleIframe.device, 'iphone', 'example iframe uses the reusable iPhone device frame')
assert.strictEqual(exampleIframe.layout, 'phone-right', 'example iframe demonstrates phone plus side-copy layout')
assert(exampleIframe.side && exampleIframe.side.title && exampleIframe.side.bullets.length, 'example iframe includes reusable side copy')
assert(!exampleIframe.srcdoc, 'example iframe is a real external iframe, not srcdoc')
assert(!exampleIframe.hint, 'example iframe does not render distracting text hint copy')

fs.writeFileSync(path.join(talk, 'talk.js'), [
  'import { overlay } from \'power-slides\'',
  '',
  'export default {',
  '  renderers: {',
  '    thanks (slide) {',
  '      return overlay({ title: slide.title || \'Imported helper works\' })',
  '    }',
  '  }',
  '}',
  ''
].join('\n'))

const buildOutput = execFileSync(process.execPath, [cli, 'build', talk], { encoding: 'utf8', stdio: 'pipe' })
assert(buildOutput.includes('power-slides v' + rootPackage.version + ' building ' + talk), 'build output includes current package version')

const publicDir = path.join(talk, 'public')
const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
const match = html.match(/power-slides\.[a-f0-9]{10}\.js/)
assert(match, 'build writes cache-busted script URL')
assert(fs.existsSync(path.join(publicDir, match[0])), 'build writes bundle')
assert(!html.includes('entry.js'), 'build HTML points at production bundle')

assert(html.includes('<title>Content-only talks</title>'), 'build infers HTML title from first YAML slide')
assert(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">'), 'build HTML locks mobile viewport zoom')
const generatedEntry = fs.readFileSync(path.join(talk, '.power-slides', 'entry.js'), 'utf8')
const generatedSlides = JSON.parse(fs.readFileSync(path.join(talk, '.power-slides', 'slides.json'), 'utf8'))
assert(generatedEntry.includes("import spec from './slides.json'"), 'generated entry imports generated slide data')
assert(generatedEntry.includes('remoteOptions') && generatedEntry.includes('remote: remoteOptions'), 'generated entry enables remote/options shell by default')
assert(html.includes('<script src="./peerjs.min.js"></script>') && html.indexOf('peerjs.min.js') < html.indexOf(match[0]), 'build HTML loads bundled PeerJS before the deck bundle')
assert(fs.existsSync(path.join(publicDir, 'peerjs.min.js')), 'build copies bundled PeerJS into public output')
assert(!generatedEntry.includes('Content-only talks'), 'generated entry does not bake slide title content')
assert(!generatedEntry.includes('slides.yaml + optional ESM talk.js'), 'generated entry does not bake slide subtitle content')
assert.deepStrictEqual(generatedSlides, initializedSpec, 'generated slides.json matches parsed YAML spec')

const devWatchTalk = path.join(tmp, 'dev-watch-talk')
runCliWithBlockedBuildDeps(['init', devWatchTalk])
const devWatchOutput = runDevWatchSmoke(devWatchTalk)
assert(devWatchOutput.includes('power-slides v' + rootPackage.version + ' dev serving ' + devWatchTalk), 'dev output includes current package version')

const installedPrefix = path.join(tmp, 'installed-prefix')
const installedTalk = path.join(tmp, 'installed-talk')
let packedTarball
try {
  packedTarball = execFileSync('npm', ['pack', '--silent'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).pop()
  const packedPath = path.join(root, packedTarball)
  execFileSync('npm', ['install', '--silent', '--prefix', installedPrefix, '--omit=dev', packedPath], { stdio: 'pipe' })
  fs.unlinkSync(packedPath)
  packedTarball = null

  const binDir = path.join(installedPrefix, 'node_modules', '.bin')
  const installedCli = path.join(binDir, process.platform === 'win32' ? 'power-slides.cmd' : 'power-slides')
  const installedBrowserify = path.join(binDir, process.platform === 'win32' ? 'browserify.cmd' : 'browserify')
  const installedPackageRoot = path.join(installedPrefix, 'node_modules', 'power-slides')
  const installedEsmify = path.join(installedPrefix, 'node_modules', 'esmify', 'esmify.js')

  execFileSync(installedCli, ['init', installedTalk], { cwd: tmp, stdio: 'pipe' })
  assert(fs.existsSync(path.join(installedTalk, 'package.json')), 'installed power-slides init writes package.json')
  const installedTalkPackage = JSON.parse(fs.readFileSync(path.join(installedTalk, 'package.json'), 'utf8'))
  assert.strictEqual(installedTalkPackage.devDependencies['power-slides'], '^' + rootPackage.version, 'installed power-slides init uses current package version in generated devDependency')
  assert.strictEqual(installedTalkPackage.scripts.dev, 'powerslides dev .', 'installed power-slides init writes powerslides dev script')
  assert.strictEqual(installedTalkPackage.scripts.build, 'powerslides build .', 'installed power-slides init writes powerslides build script')
  assert(fs.existsSync(path.join(installedTalk, 'public', 'spin.mp4')), 'installed power-slides init copies example media')
  assert(!fs.existsSync(path.join(installedTalk, 'public', 'index.html')), 'installed power-slides init excludes generated public index')
  const installedAliasTalk = path.join(tmp, 'installed-alias-talk')
  const installedAliasCli = path.join(binDir, process.platform === 'win32' ? 'powerslides.cmd' : 'powerslides')
  execFileSync(installedAliasCli, ['init', installedAliasTalk], { cwd: tmp, stdio: 'pipe' })
  assert.strictEqual(fs.readFileSync(path.join(installedAliasTalk, 'slides.yaml'), 'utf8'), exampleSlidesSource, 'installed powerslides alias init copies example slides')
  execFileSync(installedCli, ['build', installedTalk], { cwd: tmp, stdio: 'pipe' })
  const installedHtml = fs.readFileSync(path.join(installedTalk, 'public', 'index.html'), 'utf8')
  const installedMatch = installedHtml.match(/power-slides\.[a-f0-9]{10}\.js/)
  assert(installedMatch, 'installed package build writes cache-busted script URL')
  assert(fs.existsSync(path.join(installedTalk, 'public', installedMatch[0])), 'installed package build writes bundle')
  assert(fs.existsSync(path.join(installedTalk, 'public', 'peerjs.min.js')), 'installed package build copies PeerJS runtime')
  assert(installedHtml.includes('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">'), 'installed package build locks mobile viewport zoom')

  const devStyleBundle = path.join(installedTalk, 'public', 'power-slides-dev-smoke.js')
  execFileSync(installedBrowserify, [
    path.join(installedTalk, '.power-slides', 'entry.js'),
    '-p', '[', installedEsmify, '--basedir', installedPrefix, ']',
    '-r', path.join(installedPackageRoot, 'index.mjs') + ':power-slides',
    '-o', devStyleBundle
  ], { cwd: tmp, stdio: 'pipe' })
  assert(fs.existsSync(devStyleBundle), 'installed package dev-style browserify args bundle ESM package entry')
} finally {
  if (packedTarball) {
    try { fs.unlinkSync(path.join(root, packedTarball)) } catch (err) {}
  }
}

const priority = path.join(tmp, 'priority')
execFileSync(process.execPath, [cli, 'init', priority], { stdio: 'pipe' })
fs.writeFileSync(path.join(priority, 'slides.yml'), yaml.dump({ slides: [{ type: 'overlay', title: 'YML title' }] }, { lineWidth: -1, noRefs: true }))
fs.writeFileSync(path.join(priority, 'slides.json'), JSON.stringify({ slides: [{ type: 'overlay', title: 'JSON title' }] }, null, 2))
execFileSync(process.execPath, [cli, 'build', priority], { stdio: 'pipe' })
const priorityHtml = fs.readFileSync(path.join(priority, 'public', 'index.html'), 'utf8')
assert(priorityHtml.includes('<title>Content-only talks</title>'), 'default build prefers slides.yaml over slides.yml and slides.json')
execFileSync(process.execPath, [cli, 'build', priority, '--slides', 'slides.json'], { stdio: 'pipe' })
const explicitHtml = fs.readFileSync(path.join(priority, 'public', 'index.html'), 'utf8')
assert(explicitHtml.includes('<title>JSON title</title>'), 'explicit --slides can select JSON spec')

const ymlPreferred = path.join(tmp, 'yml-preferred')
fs.mkdirSync(ymlPreferred)
fs.mkdirSync(path.join(ymlPreferred, 'public'))
fs.writeFileSync(path.join(ymlPreferred, 'slides.yml'), yaml.dump({ slides: [{ type: 'overlay', title: 'Legacy YML title' }] }, { lineWidth: -1, noRefs: true }))
fs.writeFileSync(path.join(ymlPreferred, 'slides.json'), JSON.stringify({ slides: [{ type: 'overlay', title: 'YML fallback JSON title' }] }, null, 2))
execFileSync(process.execPath, [cli, 'build', ymlPreferred], { stdio: 'pipe' })
const ymlPreferredHtml = fs.readFileSync(path.join(ymlPreferred, 'public', 'index.html'), 'utf8')
assert(ymlPreferredHtml.includes('<title>Legacy YML title</title>'), 'default build supports slides.yml and prefers it over slides.json')

const jsonOnly = path.join(tmp, 'json-only')
fs.mkdirSync(jsonOnly)
fs.mkdirSync(path.join(jsonOnly, 'public'))
fs.writeFileSync(path.join(jsonOnly, 'slides.json'), JSON.stringify({ slides: [{ type: 'overlay', title: 'Unambiguous JSON title' }] }, null, 2))
execFileSync(process.execPath, [cli, 'build', jsonOnly], { stdio: 'pipe' })
const jsonOnlyHtml = fs.readFileSync(path.join(jsonOnly, 'public', 'index.html'), 'utf8')
assert(jsonOnlyHtml.includes('<title>Unambiguous JSON title</title>'), 'unambiguous slides.json still builds by default')

import(path.join(root, 'index.mjs')).then(async mod => {
  const assets = mod.collectAssets({
    slides: [
      { type: 'overlay', background: 'https://cdn.example/bg.png' },
      { type: 'quote', image: '/local.png' }
    ]
  })
  assert.deepStrictEqual(assets.sort(), ['/local.png', 'https://cdn.example/bg.png'].sort())

  const previousDocument = global.document
  const previousWindow = global.window
  global.document = createFakeDocument()
  global.window = createFakeWindow()
  try {
    function Peer () {}
    const remoteTarget = global.document.body
    const deck = mod.startTalk(remoteTarget, ['Remote-enabled ESM deck'], { remote: { Peer, buttonHideMs: 1 } })
    const optionsButton = findDeep(remoteTarget, child => String(child.className).includes('ps-remote-options-button'))
    assert(deck.remoteState, 'ESM startTalk initializes remote/options state when remote is enabled')
    assert.strictEqual(deck.opts.remote.Peer, Peer, 'ESM startTalk keeps the bundled PeerJS constructor in remote options')
    assert(optionsButton, 'ESM startTalk renders the visible remote/options button')
    deck.openOptions()
    assert(findDeep(remoteTarget, child => String(child.className).includes('ps-remote-options')), 'ESM startTalk opens the remote/options overlay')

    const quoteTarget = new FakeElement('section')
    const quoteSlide = mod.quote({ quote: 'Tiny UI', image: '/phone.png' })
    assert(quoteSlide.assets.includes('/phone.png'), 'quote helper tracks side image asset')
    quoteSlide(quoteTarget)
    const quoteRoot = quoteTarget.children[0]
    const quoteLayout = findDeep(quoteRoot, child => String(child.className).includes('ps-quote-layout'))
    const quoteCopy = findDeep(quoteRoot, child => String(child.className).includes('ps-quote-copy'))
    const quoteMedia = findDeep(quoteRoot, child => String(child.className).includes('ps-quote-media'))
    const quoteImage = findDeep(quoteRoot, child => child.tagName === 'img')
    assert(quoteLayout, 'quote helper renders a named layout wrapper')
    assert.strictEqual(quoteLayout.style.width, '100%', 'quote layout fills the slide width')
    assert.strictEqual(quoteLayout.style.boxSizing, 'border-box', 'quote layout keeps padding inside the slide')
    assert.strictEqual(quoteLayout.style.minWidth, 0, 'quote layout can shrink grid columns')
    assert.strictEqual(quoteLayout.style.gridTemplateColumns, 'minmax(0, 0.82fr) minmax(0, 1.18fr)', 'quote image slides default to a wider media column')
    assert.strictEqual(quoteLayout.style.gridTemplateRows, 'minmax(0, 1fr)', 'quote layout constrains the grid row to the slide height')
    assert.strictEqual(quoteLayout.style.gap, 'clamp(1.5rem, 3vw, 3.25rem)', 'quote image slides use a tighter responsive gap')
    assert.strictEqual(quoteLayout.style.padding, 'clamp(2rem, 5vh, 4.5rem) clamp(2rem, 5vw, 5rem)', 'quote image slides use responsive bounded padding')
    assert.strictEqual(quoteCopy.style.justifySelf, 'end', 'quote copy defaults near the media column')
    assert.strictEqual(quoteCopy.style.textAlign, 'left', 'quote image slide copy defaults left-aligned')
    assert.strictEqual(quoteCopy.style.maxWidth, 'min(34rem, 100%)', 'quote image slide copy has a sensible max width')
    assert.strictEqual(quoteMedia.style.width, '100%', 'quote media wrapper fills its grid cell')
    assert.strictEqual(quoteMedia.style.minWidth, 0, 'quote media wrapper can shrink inside the grid')
    assert.strictEqual(quoteMedia.style.minHeight, 0, 'quote media wrapper can shrink inside the grid row')
    assert.strictEqual(quoteMedia.style.alignItems, 'center', 'quote media wrapper centers image vertically by default')
    assert.strictEqual(quoteMedia.style.justifyContent, 'center', 'quote media wrapper centers image horizontally by default')
    assert.strictEqual(quoteImage.attributes.src, '/phone.png', 'quote image renders the configured side image')
    assert.strictEqual(quoteImage.style.maxHeight, 'min(82vh, 100%)', 'quote image default max height stays inside the padded slide')
    assert.strictEqual(quoteImage.style.objectFit, 'contain', 'quote image still preserves contain fitting')

    const quoteOverrideTarget = new FakeElement('section')
    mod.quote({
      quote: 'Override',
      image: '/override.png',
      columns: '1fr 2fr',
      rows: 'minmax(0, 2fr)',
      gap: '1rem',
      padding: '2rem',
      align: 'right',
      copyJustify: 'center',
      copyMaxWidth: '20rem',
      copyStyle: { color: 'red' },
      imageAlign: 'flex-start',
      imageJustify: 'flex-end',
      mediaStyle: { background: 'blue' },
      imageStyle: { maxHeight: '40vh' }
    })(quoteOverrideTarget)
    const quoteOverrideRoot = quoteOverrideTarget.children[0]
    const quoteOverrideLayout = findDeep(quoteOverrideRoot, child => String(child.className).includes('ps-quote-layout'))
    const quoteOverrideCopy = findDeep(quoteOverrideRoot, child => String(child.className).includes('ps-quote-copy'))
    const quoteOverrideMedia = findDeep(quoteOverrideRoot, child => String(child.className).includes('ps-quote-media'))
    const quoteOverrideImage = findDeep(quoteOverrideRoot, child => child.tagName === 'img')
    assert.strictEqual(quoteOverrideLayout.style.gridTemplateColumns, '1fr 2fr', 'quote columns override controls grid proportions')
    assert.strictEqual(quoteOverrideLayout.style.gridTemplateRows, 'minmax(0, 2fr)', 'quote rows override controls grid row sizing')
    assert.strictEqual(quoteOverrideLayout.style.gap, '1rem', 'quote gap override is applied')
    assert.strictEqual(quoteOverrideLayout.style.padding, '2rem', 'quote padding override is applied')
    assert.strictEqual(quoteOverrideCopy.style.textAlign, 'right', 'quote align controls copy text alignment')
    assert.strictEqual(quoteOverrideCopy.style.justifySelf, 'center', 'quote copyJustify controls copy placement')
    assert.strictEqual(quoteOverrideCopy.style.maxWidth, '20rem', 'quote copyMaxWidth controls copy measure')
    assert.strictEqual(quoteOverrideCopy.style.color, 'red', 'quote copyStyle is merged last')
    assert.strictEqual(quoteOverrideMedia.style.alignItems, 'flex-start', 'quote imageAlign controls media wrapper alignment')
    assert.strictEqual(quoteOverrideMedia.style.justifyContent, 'flex-end', 'quote imageJustify controls media wrapper justification')
    assert.strictEqual(quoteOverrideMedia.style.background, 'blue', 'quote mediaStyle is merged last')
    assert.strictEqual(quoteOverrideImage.style.maxHeight, '40vh', 'quote imageStyle is merged last')

    const chartTarget = new FakeElement('section')
    const chartSlide = mod.chart({ quote: 'Chart', src: '/chart.png', gridTemplateColumns: '2fr 3fr' })
    assert(chartSlide.assets.includes('/chart.png'), 'chart helper tracks image assets through quote')
    chartSlide(chartTarget)
    const chartLayout = findDeep(chartTarget.children[0], child => String(child.className).includes('ps-quote-layout'))
    const chartHeading = findDeep(chartTarget.children[0], child => child.tagName === 'h1')
    assert.strictEqual(chartLayout.style.gridTemplateColumns, '2fr 3fr', 'chart inherits quote grid override fields')
    assert.strictEqual(chartHeading.style.fontSize, '3.2vw', 'chart still uses the smaller default quote text size')

    const target = new FakeElement('section')
    let nextCount = 0
    let prevCount = 0
    const originalNext = mod.default.nextSlide
    const originalPrev = mod.default.prevSlide
    mod.default.nextSlide = function () { nextCount++ }
    mod.default.prevSlide = function () { prevCount++ }

    const slide = mod.iframe(null, { srcdoc: '<button>same origin</button>', title: 'Srcdoc test' })
    slide(target)

    const rootEl = target.children[0]
    const frame = findDeep(rootEl, child => child.tagName === 'iframe')
    const textHint = findDeep(rootEl, child => String(child.className).includes('ps-iframe-nav-hint'))
    const controls = findDeep(rootEl, child => String(child.className).includes('ps-iframe-nav-controls'))
    const prevButton = findDeep(rootEl, child => String(child.className).includes('ps-iframe-nav-prev'))
    const nextButton = findDeep(rootEl, child => String(child.className).includes('ps-iframe-nav-next'))
    assert(frame, 'iframe helper renders iframe')
    assert.strictEqual(frame.attributes.srcdoc, '<button>same origin</button>', 'iframe helper preserves srcdoc')
    assert(!textHint, 'iframe helper does not render the old text navigation hint')
    assert(controls && controls.style.pointerEvents === 'none', 'iframe helper renders parent-level navigation controls')
    assert(prevButton && nextButton, 'iframe helper renders subtle previous/next arrow buttons')
    assert.strictEqual(prevButton.children[0], '‹', 'previous iframe nav control is an arrow, not talk copy')
    assert.strictEqual(nextButton.children[0], '›', 'next iframe nav control is an arrow, not talk copy')

    const srcTarget = new FakeElement('section')
    mod.iframe('https://example.test/demo', { title: 'Src test', navigationControls: false })(srcTarget)
    const srcRoot = srcTarget.children[0]
    const srcFrame = findDeep(srcRoot, child => child.tagName === 'iframe')
    assert.strictEqual(srcFrame.attributes.src, 'https://example.test/demo', 'iframe helper preserves normal src URLs')
    assert(!findDeep(srcRoot, child => String(child.className).includes('ps-iframe-nav-controls')), 'iframe navigation controls can be disabled')

    const phoneTarget = new FakeElement('section')
    mod.iframe('https://david.app/', {
      title: 'Phone demo',
      device: 'iphone',
      layout: 'phone-right',
      side: {
        eyebrow: 'External demo',
        title: 'Copy beside phone',
        subtitle: 'Parent slide copy, not iframe copy.',
        bullets: ['Reusable YAML', 'No iframe overlay']
      }
    })(phoneTarget)
    const phoneRoot = phoneTarget.children[0]
    const phoneLayout = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-phone-layout'))
    const phoneSideCopy = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-side-copy'))
    const phoneSideTitle = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-side-title'))
    const phoneBullets = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-side-bullets'))
    const phoneDevice = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-device-iphone'))
    const phoneControls = phoneRoot.children.find(child => String(child.className).includes('ps-iframe-nav-controls'))
    const phoneScreen = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-device-screen'))
    const phoneSpeaker = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-device-speaker'))
    const phoneSafeArea = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-device-safe-area'))
    const phoneFrame = findDeep(phoneRoot, child => child.tagName === 'iframe')
    assert(String(phoneRoot.className).includes('ps-iframe-layout-phone-right'), 'phone side-copy layout is marked on the root')
    assert(phoneLayout, 'phone side-copy layout renders a reusable parent container')
    assert(phoneSideCopy && phoneSideTitle && phoneSideTitle.children.includes('Copy beside phone'), 'phone side-copy layout renders talk copy beside the device')
    assert(phoneBullets && phoneBullets.children.length === 2, 'phone side-copy layout renders bullets')
    assert(phoneDevice, 'iframe helper renders an iPhone-like device frame when requested')
    assert.strictEqual(phoneLayout.children[0], phoneSideCopy, 'phone-right layout puts side copy before the phone')
    assert.strictEqual(phoneLayout.children[1], phoneDevice, 'phone-right layout puts the phone on the right')
    assert.strictEqual(phoneFrame.attributes.src, 'https://david.app/', 'phone-framed iframe preserves external src URL')
    assert(phoneScreen && phoneScreen.children.includes(phoneFrame), 'phone-framed iframe renders inside the rounded device screen')
    assert(phoneControls && !containsDeep(phoneDevice, phoneControls), 'phone-framed iframe keeps arrow controls outside/over the device frame')
    assert(!containsDeep(phoneFrame, phoneControls), 'phone-framed iframe keeps nav controls on the parent slide')
    assert(!phoneSpeaker, 'phone frame does not add a fake speaker/notch overlay')
    assert(!phoneSafeArea, 'phone frame does not add a notch safe-area overlay')

    const phoneLeftTarget = new FakeElement('section')
    mod.iframe('https://example.test/mobile', { device: 'iphone', layout: 'phone-left', side: { title: 'Phone first' } })(phoneLeftTarget)
    const phoneLeftRoot = phoneLeftTarget.children[0]
    const phoneLeftLayout = findDeep(phoneLeftRoot, child => String(child.className).includes('ps-iframe-phone-layout'))
    const phoneLeftDevice = findDeep(phoneLeftRoot, child => String(child.className).includes('ps-iframe-device-iphone'))
    const phoneLeftSideCopy = findDeep(phoneLeftRoot, child => String(child.className).includes('ps-iframe-side-copy'))
    assert(String(phoneLeftRoot.className).includes('ps-iframe-layout-phone-left'), 'phone-left layout is marked on the root')
    assert.strictEqual(phoneLeftLayout.children[0], phoneLeftDevice, 'phone-left layout puts the phone first')
    assert.strictEqual(phoneLeftLayout.children[1], phoneLeftSideCopy, 'phone-left layout puts side copy after the phone')

    const talkSource = fs.readFileSync(path.join(root, 'example', 'talk.js'), 'utf8')
    const talkConfig = (await import('data:text/javascript;base64,' + Buffer.from(talkSource).toString('base64'))).default
    const talkSlides = talkConfig.slides([
      { type: 'iframe', src: 'https://david.app/', device: 'iphone', layout: 'phone-right', side: { title: 'Columns' } },
      { type: 'custom', name: 'end', title: 'Summary columns' }
    ])
    const talkIframe = talkSlides[0]
    assert.strictEqual(talkIframe.stagePadding, 'clamp(2.2rem, 5vh, 4.2rem) clamp(3.5rem, 7vw, 7rem)', 'example iframe puts stage padding on the outer slide')
    assert.strictEqual(talkIframe.layoutWidth, 'min(1180px, 92vw)', 'example iframe uses the shared column container width')
    assert.strictEqual(talkIframe.layoutPadding, '0', 'example iframe leaves the inner grid unpadded')
    assert.strictEqual(talkIframe.layoutGap, 'clamp(2.4rem, 4.8vw, 5rem)', 'example iframe uses the shared column gap')
    assert.strictEqual(talkIframe.layoutStyle.gridTemplateColumns, 'minmax(0, 0.92fr) minmax(20rem, 0.78fr)', 'example iframe uses shared two-column proportions')
    assert.strictEqual(talkIframe.deviceWidth, 'min(54vh, 30vw, 430px)', 'example iframe makes the phone frame larger than the previous narrow default')
    assert.strictEqual(talkIframe.side.maxWidth, '35rem', 'example iframe side copy is capped to the shared copy rail')
    assert.strictEqual(talkIframe.side.style.borderTop, undefined, 'example iframe side copy has no horizontal top border')
    assert.strictEqual(talkIframe.side.style.borderBottom, undefined, 'example iframe side copy has no horizontal bottom border')

    const themedPhoneTarget = new FakeElement('section')
    mod.iframe(talkIframe.src, talkIframe)(themedPhoneTarget)
    const themedPhoneRoot = themedPhoneTarget.children[0]
    const themedPhoneLayout = findDeep(themedPhoneRoot, child => String(child.className).includes('ps-iframe-phone-layout'))
    const themedPhoneSideCopy = findDeep(themedPhoneRoot, child => String(child.className).includes('ps-iframe-side-copy'))
    const themedPhoneDevice = findDeep(themedPhoneRoot, child => String(child.className).includes('ps-iframe-device-iphone'))
    assert.strictEqual(themedPhoneRoot.style.padding, talkIframe.stagePadding, 'rendered example phone slide applies padding to the outer stage')
    assert.strictEqual(themedPhoneRoot.style.boxSizing, 'border-box', 'rendered example phone slide keeps stage padding inside the slide')
    assert.strictEqual(themedPhoneLayout.style.width, talkIframe.layoutWidth, 'rendered example phone slide uses the shared column container')
    assert.strictEqual(themedPhoneLayout.style.maxWidth, '100%', 'rendered example phone slide can shrink within the padded stage')
    assert.strictEqual(themedPhoneLayout.style.padding, '0', 'rendered example phone slide does not shrink columns with inner grid padding')
    assert.strictEqual(themedPhoneLayout.style.gridTemplateColumns, talkIframe.layoutStyle.gridTemplateColumns, 'rendered example phone slide uses shared column proportions')
    assert.strictEqual(themedPhoneSideCopy.style.borderTop, undefined, 'rendered example phone side copy has no horizontal top border')
    assert.strictEqual(themedPhoneSideCopy.style.borderBottom, undefined, 'rendered example phone side copy has no horizontal bottom border')
    assert.strictEqual(themedPhoneDevice.style.width, talkIframe.deviceWidth, 'rendered example phone frame uses the larger themed width')

    const summaryTarget = new FakeElement('section')
    talkConfig.renderers.end(talkSlides[1])(summaryTarget)
    const summaryRoot = summaryTarget.children[0]
    const summaryColumns = findDeep(summaryRoot, child => String(child.className).includes('talk-columns'))
    const summaryPanel = findDeep(summaryRoot, child => String(child.className).includes('talk-panel'))
    const summaryStyle = findDeep(summaryRoot, child => child.tagName === 'style')
    assert(summaryColumns && summaryColumns.children.length === 2, 'summary slide renders copy and card inside the shared two-column wrapper')
    assert(summaryPanel, 'summary slide still renders the closing card')
    assert(summaryStyle.textContent.includes(`padding: ${talkIframe.stagePadding};`), 'summary slide uses the same outer stage padding as the phone slide')
    assert(summaryStyle.textContent.includes(`width: ${talkIframe.layoutWidth};`), 'summary slide uses the same column container width as the phone slide')
    assert(summaryStyle.textContent.includes('max-width: 100%;'), 'summary slide can shrink columns within the padded stage')
    assert(summaryStyle.textContent.includes(`grid-template-columns: ${talkIframe.layoutStyle.gridTemplateColumns};`), 'summary slide uses the same column proportions as the phone slide')
    assert(summaryStyle.textContent.includes('max-width: 31rem;'), 'summary slide caps the card width so it does not stretch to the edge')

    prevButton.onclick(fakeKey('click'))
    nextButton.onclick(fakeKey('click'))
    assert.strictEqual(prevCount, 1, 'previous iframe arrow calls PowerSlides.prevSlide')
    assert.strictEqual(nextCount, 1, 'next iframe arrow calls PowerSlides.nextSlide')

    frame.dispatch('load')
    frame.contentWindow.dispatch('keydown', fakeKey('ArrowRight'))
    frame.contentWindow.dispatch('keydown', fakeKey('ArrowLeft'))
    frame.contentWindow.dispatch('keydown', fakeKey('Escape'))
    assert.strictEqual(nextCount, 2, 'same-origin iframe ArrowRight forwards to deck')
    assert.strictEqual(prevCount, 2, 'same-origin iframe ArrowLeft forwards to deck')
    assert(rootEl.focused, 'same-origin iframe Escape returns focus to deck')

    mod.default.nextSlide = originalNext
    mod.default.prevSlide = originalPrev
  } finally {
    global.document = previousDocument
    global.window = previousWindow
  }

  console.log('cli smoke ok')
}).catch(err => {
  console.error(err.stack || err)
  process.exit(1)
})

function fakeKey (key) {
  return {
    key,
    prevented: false,
    stopped: false,
    preventDefault () { this.prevented = true },
    stopPropagation () { this.stopped = true }
  }
}

function findDeep (root, predicate) {
  if (!root) return undefined
  if (predicate(root)) return root
  for (const child of root.children || []) {
    const found = findDeep(child, predicate)
    if (found) return found
  }
}

function containsDeep (root, target) {
  if (!root || !target) return false
  if (root === target) return true
  return (root.children || []).some(child => containsDeep(child, target))
}

function createFakeDocument () {
  const document = {
    body: new FakeElement('body'),
    createElement (tagName) {
      return new FakeElement(tagName)
    },
    createTextNode (text) {
      return String(text)
    }
  }
  return document
}

function createFakeWindow () {
  return {
    innerWidth: 1024,
    innerHeight: 768,
    location: {
      hash: '',
      search: '',
      href: 'https://talk.example/#/1',
      origin: 'https://talk.example',
      pathname: '/'
    },
    listeners: {},
    addEventListener (name, fn) {
      this.listeners[name] = this.listeners[name] || []
      this.listeners[name].push(fn)
    },
    Image: function FakeImage () {}
  }
}

function createFakeContentWindow () {
  return {
    listeners: {},
    addEventListener (name, fn) {
      this.listeners[name] = this.listeners[name] || []
      this.listeners[name].push(fn)
    },
    dispatch (name, event) {
      ;(this.listeners[name] || []).forEach(fn => fn(event))
    }
  }
}

class FakeElement {
  constructor (tagName) {
    this.tagName = tagName
    this.children = []
    this.attributes = {}
    this.listeners = {}
    this.style = createFakeStyle()
    this.className = ''
    this.nodeType = tagName === '#text' ? 3 : 1
    this.nodeName = tagName === '#text' ? '#text' : String(tagName).toUpperCase()
    this.onclick = null
    this.focused = false
    if (tagName === 'iframe') this.contentWindow = createFakeContentWindow()
  }

  appendChild (child) {
    this.children.push(child)
    if (child && typeof child === 'object') child.parentNode = this
    return child
  }

  removeChild (child) {
    this.children = this.children.filter(item => item !== child)
    if (child && typeof child === 'object') child.parentNode = null
    return child
  }

  setAttribute (key, value) {
    this.attributes[key] = value
  }

  addEventListener (name, fn) {
    this.listeners[name] = this.listeners[name] || []
    this.listeners[name].push(fn)
  }

  dispatch (name, event) {
    ;(this.listeners[name] || []).forEach(fn => fn(event))
  }

  focus () {
    this.focused = true
  }
}

function createFakeStyle () {
  return {
    setProperty (key, value) {
      this[key] = value
    }
  }
}
