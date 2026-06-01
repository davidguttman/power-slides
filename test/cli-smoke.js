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
const generatedExamplePeerScript = path.join(root, 'examples', 'starter', 'public', 'peerjs.min.js')

function slideArray (spec) {
  return Array.isArray(spec) ? spec : (spec && spec.slides) || []
}

function firstYamlBlock (markdown, label) {
  const match = markdown.match(/```yaml\n([\s\S]*?)```/)
  assert(match, label + ' has a YAML example')
  return match[1]
}

function assertBareSlideArrayExample (markdown, label) {
  const source = firstYamlBlock(markdown, label)
  const parsed = yaml.load(source)
  assert(Array.isArray(parsed), label + ' first YAML example is a bare slide array')
  assert(!/^\s*(title|style|slides):/m.test(source), label + ' first YAML example does not start with deck object keys')
  assert(parsed.length > 0 && parsed[0] && typeof parsed[0] === 'object', label + ' first YAML example contains slide objects')
}

function walkSlideObjects (value, visit) {
  if (Array.isArray(value)) {
    for (const item of value) walkSlideObjects(item, visit)
    return
  }
  if (!value || typeof value !== 'object') return
  visit(value)
  if (Array.isArray(value.columns)) walkSlideObjects(value.columns, visit)
}

function assertNoPublicLegacyFields (slides, label) {
  walkSlideObjects(slides, slide => {
    assert(!Object.prototype.hasOwnProperty.call(slide, 'iframeTitle'), label + ' does not use iframeTitle')
    assert(!Object.prototype.hasOwnProperty.call(slide, 'quote'), label + ' does not use removed quote field')
    assert(!Object.prototype.hasOwnProperty.call(slide, 'attribution'), label + ' does not use removed attribution field')
    assert(!Object.prototype.hasOwnProperty.call(slide, 'side'), label + ' iframe-plus-copy uses columns, not iframe side')
    assert(!Object.prototype.hasOwnProperty.call(slide, 'src'), label + ' does not use src alias')
    assert(!Object.prototype.hasOwnProperty.call(slide, 'img'), label + ' does not use img alias')
    assert(!Object.prototype.hasOwnProperty.call(slide, 'url'), label + ' does not use url alias')
    assert(!Object.prototype.hasOwnProperty.call(slide, 'type'), label + ' uses content properties instead of type')
  })
}

function cleanupGeneratedExampleArtifacts () {
  fs.rmSync(generatedExamplePeerScript, { force: true })
}

cleanupGeneratedExampleArtifacts()
process.on('exit', cleanupGeneratedExampleArtifacts)

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
    '- title: Watched title',
    '  subtitle: Updated YAML',
    ''
  ].join('\n')
  const script = `
const EventEmitter = require('events')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const cli = ${JSON.stringify(cli)}
const talkDir = ${JSON.stringify(talkDir)}
let spawnBin = null
let spawnArgs = null
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'child_process') {
    return {
      spawn (bin, args) {
        spawnBin = bin
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
if (spawnBin !== process.execPath) throw new Error('dev should spawn budo with the current Node executable: ' + spawnBin)
if (!/budo[\\/]bin[\\/]cmd[.]js$/.test(spawnArgs[0])) throw new Error('dev first arg is not the resolved budo JS entry: ' + spawnArgs[0])
if (!fs.existsSync(spawnArgs[0])) throw new Error('dev resolved budo JS entry does not exist: ' + spawnArgs[0])
if (path.basename(spawnArgs[1]) !== 'entry.js') throw new Error('dev entry arg is not generated entry.js: ' + spawnArgs[1])
if (path.basename(path.dirname(spawnArgs[1])) !== '.power-slides') throw new Error('dev entry is not in .power-slides: ' + spawnArgs[1])
setTimeout(function () {
  fs.writeFileSync(path.join(talkDir, 'slides.yaml'), ${JSON.stringify(updatedSlides)})
}, 100)
const deadline = Date.now() + 3000
function check () {
  const entry = fs.readFileSync(path.join(talkDir, '.power-slides', 'entry.js'), 'utf8')
  const html = fs.readFileSync(path.join(talkDir, 'public', 'index.html'), 'utf8')
  const spec = JSON.parse(fs.readFileSync(path.join(talkDir, '.power-slides', 'slides.json'), 'utf8'))
  const slides = Array.isArray(spec) ? spec : (spec && spec.slides) || []
  if (slides[0] && slides[0].title === 'Watched title' && html.includes('<title>Watched title</title>')) {
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

const slideApiDoc = fs.readFileSync(path.join(root, 'docs', 'slide-api.md'), 'utf8')
const canonicalShapeNames = ['title', 'image', 'video', 'iframe', 'html', 'custom', 'columns']
for (const shape of canonicalShapeNames) {
  assert(slideApiDoc.includes('## ' + shape), 'slide API doc lists ' + shape + ' shape')
}
for (const forbidden of ['type: title', 'type: columns', 'type: image', 'type: video', 'type: iframe', 'type: html', 'type: overlay', 'type: quote', 'type: chart', 'type: summary', 'attribution:', 'iframeTitle:', 'side:', 'src:', 'url:', 'size: contain']) {
  assert(!slideApiDoc.includes(forbidden), 'slide API doc omits legacy field pattern ' + forbidden)
}

const packageReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
assert(packageReadme.includes('## Slide shapes at a glance'), 'package README has concise slide shapes section')
for (const concept of canonicalShapeNames) {
  assert(packageReadme.includes('`' + concept + '`'), 'package README documents ' + concept + ' slide concept')
}
for (const oldType of ['overlay', 'quote', 'chart', 'summary', 'citation']) {
  assert(!packageReadme.includes('#### `' + oldType + '`'), 'package README does not present ' + oldType + ' as a public slide concept')
}
assertBareSlideArrayExample(packageReadme, 'package README')
const packageReadmeEditSlides = packageReadme.slice(packageReadme.indexOf('## Edit `slides.yaml`'), packageReadme.indexOf('## Slide shapes at a glance'))
assertBareSlideArrayExample(packageReadmeEditSlides, 'package README Edit slides.yaml section')
assert(packageReadme.includes('Start with a YAML list. Each item is one slide.'), 'package README teaches bare slide arrays first')
assert(packageReadme.includes('wrap the same slide list in a deck object with `title`, `style`, and `slides`'), 'package README documents object-form slide specs later')
assert(packageReadme.indexOf('## Theming and deck metadata') > packageReadme.indexOf('## Slide shapes at a glance'), 'package README moves deck metadata/theming after beginner slide list and shapes')
assert(packageReadme.includes('docs/slide-api.md'), 'package README points full slide/talk API reference to docs')
assert(packageReadme.includes('For more `talk.js` hooks, see `docs/slide-api.md`'), 'package README keeps talk.js hook details behind docs link')
for (const earlyDocNoise of ['Slide concept reference', 'Every slide object has exactly one content property', 'slides(slides, PS)', 'beforeStart(PS, spec)', 'bundled PeerJS runtime', 'remote: false']) {
  assert(!packageReadme.includes(earlyDocNoise), 'package README omits noisy detail: ' + earlyDocNoise)
}
for (const forbidden of ['iframeTitle', 'type: overlay', 'type: title', 'type: chart', 'type: summary', 'type: columns', 'type: image', 'type: video', 'type: iframe', 'type: html', 'side:', 'src:', 'url:', 'size: contain', 'without installing', 'globally', 'There is no top-level', 'no separate title metadata', 'Keyboard, touch, URL hash', 'Most talks can stay', 'instead of fighting', 'otherwise the `npx power-slides ...` commands above are enough', 'old bare array form', 'legacy', 'backward-compatible']) {
  assert(!packageReadme.includes(forbidden), 'package README omits stale slide anti-pattern ' + forbidden)
}
assert(packageReadme.includes('- `slides.yaml`') && packageReadme.includes('- `talk.js`') && packageReadme.includes('- `public/`'), 'package README generated-file list names beginner-facing files')
for (const oldFileListBullet of ['- `assets/`', '- `package.json`', '- `README.md`']) {
  assert(!packageReadme.includes(oldFileListBullet), 'package README generated-file list omits ' + oldFileListBullet)
}
const packageReadmeBeginner = packageReadme.slice(packageReadme.indexOf('## Create your first deck'), packageReadme.indexOf('## Edit `slides.yaml`'))
for (const earlyNoise of ['package.json', 'npm run', 'generated scripts', 'PeerJS', 'remote: false']) {
  assert(!packageReadmeBeginner.includes(earlyNoise), 'package README beginner path omits early ' + earlyNoise)
}
assert(packageReadme.indexOf('## Advanced: npm runners') > packageReadme.indexOf('## License'), 'package README keeps npm runner detail after License')
assert(packageReadme.trim().endsWith('Use those scripts for hosts, CI, or deploy flows that run npm commands.'), 'package README ends with concise npm runner detail')

fs.writeFileSync(generatedExamplePeerScript, 'generated PeerJS runtime artifact\n')
runCliWithBlockedBuildDeps(['init', talk])
cleanupGeneratedExampleArtifacts()

assert(fs.existsSync(path.join(talk, 'slides.yaml')), 'init writes slides.yaml')
assert(!fs.existsSync(path.join(talk, 'slides.yml')), 'init does not write slides.yml by default')
assert(!fs.existsSync(path.join(talk, 'slides.json')), 'init does not write slides.json by default')
assert(fs.existsSync(path.join(talk, 'talk.js')), 'init writes optional talk.js')
assert(fs.existsSync(path.join(talk, 'assets')), 'init creates assets convention')
assert(fs.existsSync(path.join(talk, 'public')), 'init creates public convention')
const initializedReadme = fs.readFileSync(path.join(talk, 'README.md'), 'utf8')
for (const concept of canonicalShapeNames) {
  assert(initializedReadme.includes('`' + concept + '`'), 'generated talk README documents ' + concept + ' slide concept')
}
for (const oldType of ['overlay', 'quote', 'chart', 'summary', 'citation']) {
  assert(!initializedReadme.includes('#### `' + oldType + '`'), 'generated talk README does not present ' + oldType + ' as a public slide concept')
}
assert(initializedReadme.includes('## Optional talk.js'), 'generated talk README documents optional talk.js path')
assert(initializedReadme.includes('npx power-slides dev .') && initializedReadme.includes('npx power-slides build .'), 'generated talk README foregrounds npx run/build flow')
assert(initializedReadme.includes('## Remote control') && initializedReadme.includes('press `o`') && initializedReadme.includes('Enable remote control'), 'generated talk README documents user-facing remote controls')
assertBareSlideArrayExample(initializedReadme, 'generated talk README')
const initializedEditSlides = initializedReadme.slice(initializedReadme.indexOf('## Edit slides.yaml'), initializedReadme.indexOf('## Remote control'))
assertBareSlideArrayExample(initializedEditSlides, 'generated talk README Edit slides.yaml section')
assert(initializedReadme.includes('Start with a YAML list. Each item is one slide.'), 'generated talk README teaches bare slide arrays first')
assert(initializedReadme.includes('wrap the same slide list in a deck object with `title`, `style`, and `slides`') && initializedReadme.includes('docs/slide-api.md'), 'generated talk README keeps deck object/theming later in schema/API docs')
for (const earlyDocNoise of ['Every slide object has exactly one content property', 'slides(slides, PS)', 'beforeStart(PS, spec)', 'bodyStyle', 'PeerJS', 'remote: false', 'runtime options']) {
  assert(!initializedReadme.includes(earlyDocNoise), 'generated talk README omits noisy detail: ' + earlyDocNoise)
}
for (const forbidden of ['iframeTitle', 'type: overlay', 'type: title', 'type: chart', 'type: summary', 'type: columns', 'type: image', 'type: video', 'type: iframe', 'type: html', 'side:', 'src:', 'url:', 'size: contain', 'without installing', 'globally', 'There is no top-level', 'no separate title metadata', 'Keyboard, touch, URL hash', 'Most talks can stay', 'instead of fighting', 'only when a slide needs browser code', 'otherwise the `npx power-slides ...` commands above are enough', 'old bare array form', 'legacy', 'backward-compatible']) {
  assert(!initializedReadme.includes(forbidden), 'generated talk README omits stale slide anti-pattern ' + forbidden)
}
assert(initializedReadme.includes('text, image, video, columns, iframe, html, and custom'), 'generated talk README describes starter canonical shapes')
const initializedFileList = initializedReadme.slice(initializedReadme.indexOf('## Files'), initializedReadme.indexOf('## Run and build'))
assert(initializedFileList.includes('- `slides.yaml`') && initializedFileList.includes('- `talk.js`') && initializedFileList.includes('- `public/`'), 'generated talk README file list names beginner-facing files')
for (const oldFileListText of ['- `assets/`', '- `package.json`', '- `README.md`', 'local `package.json` lets']) {
  assert(!initializedFileList.includes(oldFileListText), 'generated talk README file list omits ' + oldFileListText)
}
const initializedReadmeBeforeAuthoring = initializedReadme.slice(0, initializedReadme.indexOf('## Edit slides.yaml'))
for (const earlyNoise of ['package.json', 'npm install', 'npm run', 'The scripts call', 'PeerJS', 'remote: false']) {
  assert(!initializedReadmeBeforeAuthoring.includes(earlyNoise), 'generated talk README keeps runner/remote internals out of early flow: ' + earlyNoise)
}
assert(initializedReadme.indexOf('## Advanced: npm runners') > initializedReadme.indexOf('## Optional talk.js'), 'generated talk README moves runner detail to the end')
assert(initializedReadme.trim().endsWith('Use those scripts for hosts, CI, or deploy flows that run npm commands.'), 'generated talk README ends with concise npm runner detail')

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
assert(!fs.existsSync(path.join(talk, 'public', 'peerjs.min.js')), 'init does not copy generated PeerJS runtime')
assert(!fs.readdirSync(path.join(talk, 'public')).some(name => /^power-slides\.[a-f0-9]+\.js$/.test(name)), 'init does not copy generated public bundle')

const exampleSlidesSource = fs.readFileSync(path.join(root, 'examples', 'starter', 'slides.yaml'), 'utf8')
const exampleTalkSource = fs.readFileSync(path.join(root, 'examples', 'starter', 'talk.js'), 'utf8')
assert.strictEqual(fs.readFileSync(path.join(talk, 'slides.yaml'), 'utf8'), exampleSlidesSource, 'init copies packaged example slides.yaml')
assert.strictEqual(fs.readFileSync(path.join(talk, 'talk.js'), 'utf8'), exampleTalkSource, 'init copies packaged example talk.js')
for (const media of ['sample.svg', 'title.png', 'deploy.png', 'github-render.png', 'build-it.png', 'workflow.png', 'fractal-loop.mp4']) {
  assert.deepStrictEqual(
    fs.readFileSync(path.join(talk, 'public', media)),
    fs.readFileSync(path.join(root, 'examples', 'starter', 'public', media)),
    'init copies starter public media ' + media
  )
}
const initializedSpec = yaml.load(fs.readFileSync(path.join(talk, 'slides.yaml'), 'utf8'))
const exampleSpec = yaml.load(exampleSlidesSource)
assert.deepStrictEqual(initializedSpec, exampleSpec, 'init slides parse identically to packaged example')
assert(!Array.isArray(initializedSpec) && initializedSpec && typeof initializedSpec === 'object', 'init example is an object-form deck spec')
assert.strictEqual(initializedSpec.title, 'Power Slides Starter', 'starter deck has top-level title metadata')
assert.strictEqual(initializedSpec.style.fontFamily, 'Inter, system-ui, sans-serif', 'starter deck has top-level fontFamily style')
assert.strictEqual(initializedSpec.style.background, '#061018', 'starter deck has top-level background style')
assert.strictEqual(initializedSpec.style.color, 'white', 'starter deck has top-level color style')
assert.strictEqual(initializedSpec.style['--accent'], '#5ffbf1', 'starter deck demonstrates quoted CSS custom property style')
const initializedSlides = slideArray(initializedSpec)
assert.strictEqual(initializedSlides.length, 9, 'init starter splits the canonical story into focused moments')
assert.strictEqual(initializedSlides[0].title, 'Simple to start.', 'starter first slide introduces the simple-start story')
assert.strictEqual(initializedSlides[0].subtitle, 'One slides.yaml file. One command.', 'starter first slide keeps on-screen copy sparse')
assert.strictEqual(initializedSlides[0].background, '/title.png', 'starter title slide uses previous-talk opening background')
assert.strictEqual(initializedSlides[0].brightness, 0.35, 'starter title slide demonstrates brightness')
assert(initializedSlides[0].notes.join(' ').includes('simple to start, but no limits on power'), 'starter first slide moves the story spine into notes')
assert.strictEqual(initializedSlides[1].title, 'Checkpoint: use your phone.', 'starter second slide forces the remote-control flow')
assert(initializedSlides[1].subtitle.includes('Press o') && initializedSlides[1].subtitle.includes('Enable remote control'), 'starter remote checkpoint gives user-facing remote instructions')
assert(initializedSlides[1].notes.join(' ').includes('next-slide previews') && initializedSlides[1].notes.join(' ').includes('talk timer'), 'starter remote checkpoint notes explain previews and timers')
assert.strictEqual(initializedSlides[2].columns[0].image, '/github-render.png', 'starter third slide uses a copied generated image asset inside a designed columns moment')
assert.strictEqual(initializedSlides[2].columns[1].title, 'One folder. Real assets.', 'starter third slide keeps static-asset copy sparse')
assert.strictEqual(initializedSlides[2].columns[1].bullets, undefined, 'starter asset slide keeps detailed guidance out of projected bullets')
assert.strictEqual(initializedSlides[3].video, '/fractal-loop.mp4', 'starter fourth slide is video')
assert.strictEqual(initializedSlides[4].background, '/build-it.png', 'starter fifth slide demonstrates background image with brightness')
assert.strictEqual(initializedSlides[4].columns[0].image, '/workflow.png', 'starter fifth slide composes media with copy')
assert.strictEqual(initializedSlides[4].columns[1].title, 'No limits on power.', 'starter composition slide carries the power story')
assert.strictEqual(initializedSlides[4].columns[1].bullets, undefined, 'starter composition column does not render the old bullet list')
assert.strictEqual(initializedSlides[5].title, 'The remote carries the story.', 'starter sixth slide makes phone notes essential')
assert(initializedSlides[5].notes.join(' ').includes('next-slide preview') && initializedSlides[5].notes.join(' ').includes('slide timer'), 'starter remote story notes call out previews and pacing')
assert.strictEqual(initializedSlides[6].iframe, 'https://david.app', 'starter seventh slide loads david.app in a full iframe')
assert(!Object.prototype.hasOwnProperty.call(initializedSlides[6], 'srcdoc'), 'starter seventh slide does not use conflicting srcdoc demo content')
assert(initializedSlides[6].background.includes('/deploy.png'), 'starter seventh slide uses previous-talk deploy background')
assert.strictEqual(initializedSlides[6].device, 'iphone', 'starter iframe demonstrates phone frame')
assert(initializedSlides[7].html.includes('Bring your own markup'), 'starter eighth slide is rich html')
assert.strictEqual(initializedSlides[8].custom, 'particleField', 'starter ninth slide is custom')
assert.strictEqual(initializedSlides[8].title, 'Deploy anywhere.', 'starter final slide closes on deploy-anywhere')
assertNoPublicLegacyFields(initializedSlides, 'starter')

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

assert(!Array.isArray(exampleSpec) && exampleSpec && typeof exampleSpec === 'object', 'example is an object-form deck spec')
assert.deepStrictEqual(exampleSpec, initializedSpec, 'example and initialized spec remain identical')

fs.writeFileSync(path.join(talk, 'talk.js'), [
  'import { text } from \'power-slides\'',
  '',
  'export default {',
  '  renderers: {',
  '    thanks (slide) {',
  '      return text({ title: slide.title || \'Imported helper works\' })',
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

assert(html.includes('<title>Power Slides Starter</title>'), 'build uses top-level YAML title for HTML title')
assert(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">'), 'build HTML locks mobile viewport zoom')
const generatedEntry = fs.readFileSync(path.join(talk, '.power-slides', 'entry.js'), 'utf8')
const generatedSlides = JSON.parse(fs.readFileSync(path.join(talk, '.power-slides', 'slides.json'), 'utf8'))
assert(generatedEntry.includes("import spec from './slides.json'"), 'generated entry imports generated slide data')
assert(generatedEntry.includes('applyStyle(window.document.body.style') && generatedEntry.includes('deckStyle'), 'generated entry applies top-level deck style to document.body')
assert(generatedEntry.includes('talk.js bodyStyle win'), 'generated entry documents body style precedence')
assert(generatedEntry.includes('remoteOptions') && generatedEntry.includes('remote: remoteOptions'), 'generated entry enables remote/options shell by default')
assert(html.includes('<script src="./peerjs.min.js"></script>') && html.indexOf('peerjs.min.js') < html.indexOf(match[0]), 'build HTML loads bundled PeerJS before the deck bundle')
assert(fs.existsSync(path.join(publicDir, 'peerjs.min.js')), 'build copies bundled PeerJS into public output')
assert(!generatedEntry.includes('Simple to start.'), 'generated entry does not bake slide title content')
assert(!generatedEntry.includes('One slides.yaml file. One command.'), 'generated entry does not bake slide subtitle content')
assert.deepStrictEqual(generatedSlides, initializedSpec, 'generated slides.json matches parsed YAML spec')
assert.strictEqual(generatedSlides.style['--accent'], '#5ffbf1', 'generated slides.json preserves top-level CSS custom property key')

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
  assert(fs.existsSync(path.join(installedTalk, 'public', 'github-render.png')), 'installed power-slides init copies starter image media')
  assert(fs.existsSync(path.join(installedTalk, 'public', 'title.png')), 'installed power-slides init copies starter title background')
  assert(fs.existsSync(path.join(installedTalk, 'public', 'deploy.png')), 'installed power-slides init copies starter deploy background')
  assert(fs.existsSync(path.join(installedTalk, 'public', 'fractal-loop.mp4')), 'installed power-slides init copies starter video media')
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

  const installedNestedBudoBin = path.join(installedPackageRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'budo.cmd' : 'budo')
  assert(!fs.existsSync(installedNestedBudoBin), 'installed smoke uses flattened dependencies, not a nested power-slides budo bin')
  const installedBudoScript = execFileSync(process.execPath, ['-e', 'console.log(require.resolve(\'budo/bin/cmd.js\'))'], { cwd: installedPackageRoot, encoding: 'utf8' }).trim()
  assert(fs.existsSync(installedBudoScript), 'installed package can resolve budo/bin/cmd.js from flattened dependency tree')
  assert(!installedBudoScript.startsWith(path.join(installedPackageRoot, 'node_modules')), 'installed package budo resolution does not require nested dependencies')

  const installedDevSmoke = `
const EventEmitter = require('events')
const fs = require('fs')
const Module = require('module')
const path = require('path')
const cli = ${JSON.stringify(installedCli)}
const talkDir = ${JSON.stringify(installedTalk)}
let spawnBin = null
let spawnArgs = null
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'child_process') {
    return {
      spawn (bin, args) {
        spawnBin = bin
        spawnArgs = args
        const child = new EventEmitter()
        process.nextTick(function () { child.emit('exit', 0) })
        return child
      }
    }
  }
  return originalLoad.apply(this, arguments)
}
process.on('exit', function () {
  if (spawnBin !== process.execPath) throw new Error('installed dev should spawn with Node executable: ' + spawnBin)
  if (!spawnArgs) throw new Error('installed dev did not spawn budo')
  if (!/budo[\\/]bin[\\/]cmd[.]js$/.test(spawnArgs[0])) throw new Error('installed dev first arg is not budo JS entry: ' + spawnArgs[0])
  if (!fs.existsSync(spawnArgs[0])) throw new Error('installed dev resolved missing budo JS entry: ' + spawnArgs[0])
  if (spawnArgs[0].startsWith(path.join(${JSON.stringify(installedPackageRoot)}, 'node_modules'))) throw new Error('installed dev tried to use nested power-slides node_modules for budo: ' + spawnArgs[0])
  if (path.basename(spawnArgs[1]) !== 'entry.js') throw new Error('installed dev second arg is not generated entry.js: ' + spawnArgs[1])
})
process.argv = [process.execPath, cli, 'dev', talkDir, '--port', '9877']
require(cli)
`
  execFileSync(process.execPath, ['-e', installedDevSmoke], { cwd: installedPackageRoot, stdio: 'pipe' })

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
fs.writeFileSync(path.join(priority, 'slides.yml'), yaml.dump([{ title: 'YML title' }], { lineWidth: -1, noRefs: true }))
fs.writeFileSync(path.join(priority, 'slides.json'), JSON.stringify([{ title: 'JSON title' }], null, 2))
execFileSync(process.execPath, [cli, 'build', priority], { stdio: 'pipe' })
const priorityHtml = fs.readFileSync(path.join(priority, 'public', 'index.html'), 'utf8')
assert(priorityHtml.includes('<title>Power Slides Starter</title>'), 'default build prefers slides.yaml over slides.yml and slides.json')
execFileSync(process.execPath, [cli, 'build', priority, '--slides', 'slides.json'], { stdio: 'pipe' })
const explicitHtml = fs.readFileSync(path.join(priority, 'public', 'index.html'), 'utf8')
assert(explicitHtml.includes('<title>JSON title</title>'), 'explicit --slides can select JSON spec')

const ymlPreferred = path.join(tmp, 'yml-preferred')
fs.mkdirSync(ymlPreferred)
fs.mkdirSync(path.join(ymlPreferred, 'public'))
fs.writeFileSync(path.join(ymlPreferred, 'slides.yml'), yaml.dump([{ title: 'YML title' }], { lineWidth: -1, noRefs: true }))
fs.writeFileSync(path.join(ymlPreferred, 'slides.json'), JSON.stringify([{ title: 'YML fallback JSON title' }], null, 2))
execFileSync(process.execPath, [cli, 'build', ymlPreferred], { stdio: 'pipe' })
const ymlPreferredHtml = fs.readFileSync(path.join(ymlPreferred, 'public', 'index.html'), 'utf8')
assert(ymlPreferredHtml.includes('<title>YML title</title>'), 'default build supports slides.yml and prefers it over slides.json')

const jsonOnly = path.join(tmp, 'json-only')
fs.mkdirSync(jsonOnly)
fs.mkdirSync(path.join(jsonOnly, 'public'))
fs.writeFileSync(path.join(jsonOnly, 'slides.json'), JSON.stringify([{ title: 'Unambiguous JSON title' }], null, 2))
execFileSync(process.execPath, [cli, 'build', jsonOnly], { stdio: 'pipe' })
const jsonOnlyHtml = fs.readFileSync(path.join(jsonOnly, 'public', 'index.html'), 'utf8')
assert(jsonOnlyHtml.includes('<title>Unambiguous JSON title</title>'), 'unambiguous slides.json still builds by default')

const objectNoTitle = path.join(tmp, 'object-no-title')
fs.mkdirSync(objectNoTitle)
fs.mkdirSync(path.join(objectNoTitle, 'public'))
fs.writeFileSync(path.join(objectNoTitle, 'slides.yaml'), yaml.dump({
  style: {
    fontFamily: 'Inter, sans-serif',
    background: '#222',
    color: 'white',
    '--accent': '#5ffbf1'
  },
  slides: [{ image: '/diagram.png' }, { title: 'Fallback Object Title' }]
}, { lineWidth: -1, noRefs: true }))
execFileSync(process.execPath, [cli, 'build', objectNoTitle], { stdio: 'pipe' })
const objectNoTitleHtml = fs.readFileSync(path.join(objectNoTitle, 'public', 'index.html'), 'utf8')
const objectNoTitleSpec = JSON.parse(fs.readFileSync(path.join(objectNoTitle, '.power-slides', 'slides.json'), 'utf8'))
assert(objectNoTitleHtml.includes('<title>Fallback Object Title</title>'), 'object spec without title falls back to first title found on any slide')
assert.strictEqual(objectNoTitleSpec.style['--accent'], '#5ffbf1', 'object spec preserves quoted CSS custom property key')

const stringTitleFallback = path.join(tmp, 'string-title-fallback')
fs.mkdirSync(stringTitleFallback)
fs.writeFileSync(path.join(stringTitleFallback, 'slides.yaml'), yaml.dump([{ image: '/intro.png' }, 'String Fallback Title'], { lineWidth: -1, noRefs: true }))
execFileSync(process.execPath, [cli, 'build', stringTitleFallback], { stdio: 'pipe' })
const stringTitleFallbackHtml = fs.readFileSync(path.join(stringTitleFallback, 'public', 'index.html'), 'utf8')
assert(stringTitleFallbackHtml.includes('<title>String Fallback Title</title>'), 'array spec falls back to first string slide when earlier slides lack title/text')

import(path.join(root, 'index.mjs')).then(async mod => {
  const assets = mod.collectAssets([
    { title: 'Background', background: 'https://cdn.example/bg.png' },
    { image: '/local.png' },
    { iframe: 'https://example.test/embed' }
  ])
  assert.deepStrictEqual(assets.sort(), ['/local.png', 'https://cdn.example/bg.png', 'https://example.test/embed'].sort())

  assert.strictEqual(mod.inferSlideType({ title: 'Testimonial', subtitle: 'Speaker' }), 'text', 'title plus subtitle stays default text')
  assert.strictEqual(mod.inferSlideType({ background: '/generated/chaser-app.png', brightness: 0.55, columns: [{ iframe: 'https://example.test/app', device: 'iphone' }, { title: 'Demo', bullets: ['Parent arrows remain available'] }] }), 'columns', 'columns array infers columns even with shared slide background')
  assert.strictEqual(mod.inferSlideType({ text: 'Text/media copy', image: '/phone.png', gridTemplateColumns: '1fr 1fr' }), 'text', 'text plus side media no longer over-infers columns without columns array')
  assert.strictEqual(mod.inferSlideType({ html: '<h1>Trusted HTML</h1>' }), 'html', 'html field infers html slide')
  assert.strictEqual(mod.inferSlideType({ video: '/demo.mp4?cache=1' }), 'video', 'semantic video field infers video slide')
  assert.strictEqual(mod.inferSlideType({ iframe: 'https://example.test/app' }), 'iframe', 'semantic iframe field infers iframe slide')
  assert.strictEqual(mod.inferSlideType({ url: 'https://example.test/app', device: 'iphone', side: { title: 'Demo' } }), 'text', 'legacy url field no longer infers iframe slide')
  assert.strictEqual(mod.inferSlideType({ card: { title: 'Recap', bullets: ['One'] }, title: 'Summary' }), 'text', 'card fields no longer infer a separate summary shape')
  assert.strictEqual(mod.inferSlideType({ image: '/diagram.png', fit: 'contain' }), 'image', 'semantic image field infers image slide')
  assert.strictEqual(mod.inferSlideType({ src: '/diagram.png', fit: 'contain' }), 'text', 'legacy src no longer infers a media slide')
  assert.strictEqual(mod.inferSlideType({ type: 'image', src: '/diagram.png', fit: 'contain' }), 'text', 'legacy type plus src alias no longer infers an image slide')
  assert.strictEqual(mod.inferSlideType({ type: 'video', src: '/demo.mp4?cache=1' }), 'text', 'legacy type plus src alias no longer infers a video slide')
  assert.strictEqual(mod.inferSlideType({ type: 'iframe', url: 'https://example.test/app' }), 'text', 'legacy type plus url alias no longer infers an iframe slide')
  assert.strictEqual(mod.inferSlideType({ type: 'html', markup: '<h1>Old HTML</h1>' }), 'text', 'legacy type plus markup alias no longer infers an html slide')
  assert.strictEqual(mod.inferSlideType({ type: 'columns', slides: [{ title: 'Old column' }] }), 'text', 'legacy type plus slides alias no longer infers columns')
  assert.strictEqual(mod.inferSlideType({ type: 'image', image: '/diagram.png', fit: 'contain' }), 'image', 'type is ignored and the semantic image property still infers image')
  assert.strictEqual(mod.inferSlideType({ background: '/hero.png' }), 'text', 'background alone stays default text because all shapes can use background styling')
  assert.strictEqual(mod.inferSlideType({ title: 'Real talk title', background: '/hero.png' }), 'text', 'title plus background stays default text')
  assert.strictEqual(mod.inferSlideType({ title: 'Chart-like title', image: '/chart.png', background: '/hero.png', brightness: 0.6 }), 'text', 'title plus media-ish fields remains default text without columns array')
  assert.strictEqual(mod.inferSlideType({ custom: 'demo' }), 'custom', 'custom property selects custom shape')
  assert.strictEqual(mod.inferSlideType({ name: 'customRenderer', image: '/diagram.png' }), 'text', 'custom renderer keys prevent built-in inference')
  assert.strictEqual(mod.renderSlideObject({ name: 'special', image: '/diagram.png' }, { renderers: { special: () => 'named-renderer' } }), 'named-renderer', 'named custom renderer wins before inference')

  const speakerNoteSlides = mod.createTalk([
    { title: 'Speaker notes', notes: ['Pause here', 'Then continue'] },
    { title: 'Note alias', note: 'Alias note' }
  ])
  assert(!Array.isArray(speakerNoteSlides[0]), 'notes metadata does not wrap the rendered slide in an array')
  assert(!Array.isArray(speakerNoteSlides[1]), 'note alias metadata does not wrap the rendered slide in an array')
  assert.deepStrictEqual(mod.createTalk([['Legacy slide', 'legacy note']]), [], 'old array metadata is not converted into a slide')

  const previousDocument = global.document
  const previousWindow = global.window
  global.document = createFakeDocument()
  global.window = createFakeWindow()
  try {
    await mod.preloadAssets(['#/current', '/assets/movie.mp4'])
    const preloadedVideo = global.document.createdElements.find(el => el.tagName === 'video')
    assert(preloadedVideo, 'preloadAssets creates a video element for video assets')
    assert.strictEqual(global.document.createdElements.filter(el => el.tagName === 'video').length, 1, 'preloadAssets ignores hash-only URLs')
    assert.strictEqual(preloadedVideo.preload, 'auto', 'preloadAssets requests full video preloading')
    assert.strictEqual(preloadedVideo.src, '/assets/movie.mp4', 'preloadAssets assigns the video src')
    assert.strictEqual(preloadedVideo.loadCount, 1, 'preloadAssets explicitly starts video loading')

    let imagePreloadSettled = false
    const imagePreload = mod.preloadSlideAssets([
      { type: 'overlay', background: '/skip-first.png' },
      { type: 'quote', image: '/assets/photo.png', background: '/assets/bg.png' },
      { type: 'overlay', background: '/assets/bg.png' }
    ], { startIndex: 1 })
    imagePreload.then(() => { imagePreloadSettled = true })
    assert.strictEqual(global.window.createdImages.length, 2, 'preloadSlideAssets creates Image objects for unique image/background assets')
    assert.deepStrictEqual(global.window.createdImages.map(img => img.src).sort(), ['/assets/bg.png', '/assets/photo.png'], 'preloadSlideAssets assigns image preload src values')
    await Promise.resolve()
    assert.strictEqual(imagePreloadSettled, false, 'image preload promise waits for image load/error events')
    global.window.createdImages[0].onload()
    await Promise.resolve()
    assert.strictEqual(imagePreloadSettled, false, 'image preload promise waits for all image assets')
    global.window.createdImages[1].onerror()
    await imagePreload
    assert.strictEqual(imagePreloadSettled, true, 'image preload promise resolves after image load/error events')

    function Peer () {}
    const remoteTarget = global.document.body
    const deck = mod.startTalk(remoteTarget, [
      { title: 'Speaker notes', notes: ['Pause here', 'Then continue'] },
      { title: 'Note alias', note: 'Alias note' },
      { title: 'Remote-enabled ESM deck' }
    ], { remote: { Peer, buttonHideMs: 1 } })
    const optionsButton = findDeep(remoteTarget, child => String(child.className).includes('ps-remote-options-button'))
    assert.deepStrictEqual(deck.notes[0], ['Pause here', 'Then continue'], 'notes metadata attaches to deck state')
    assert.deepStrictEqual(deck.notes[1], ['Alias note'], 'note metadata attaches to deck state')
    assert.strictEqual(deck.notes[2], undefined, 'slides without notes do not attach deck notes')
    assert(deck.remoteState, 'ESM startTalk initializes remote/options state when remote is enabled')
    assert.strictEqual(deck.opts.remote.Peer, Peer, 'ESM startTalk keeps the bundled PeerJS constructor in remote options')
    assert(optionsButton, 'ESM startTalk renders the visible remote/options button')
    deck.openOptions()
    assert(findDeep(remoteTarget, child => String(child.className).includes('ps-remote-options')), 'ESM startTalk opens the remote/options overlay')

    assert.strictEqual(mod.default.columns, mod.columns, 'default export exposes columns helper')
    const inferredColumnsTarget = new FakeElement('section')
    const inferredColumnsSlide = mod.renderSlideObject({
      background: '/generated/chaser-app.png',
      brightness: 0.55,
      columns: [
        { iframe: 'https://example.test/app', device: 'iphone' },
        { title: 'Demo', bullets: ['Cross-origin page stays untouched', 'Parent arrows remain available'] }
      ]
    })
    assert(inferredColumnsSlide.assets.includes('/generated/chaser-app.png'), 'inferred columns slide tracks shared background asset')
    assert(inferredColumnsSlide.assets.includes('https://example.test/app'), 'inferred columns slide tracks column iframe URL')
    inferredColumnsSlide(inferredColumnsTarget)
    const inferredColumnsRoot = inferredColumnsTarget.children[0]
    const inferredColumnsLayout = findDeep(inferredColumnsRoot, child => String(child.className).includes('ps-columns-layout'))
    const inferredColumnsIframe = findDeep(inferredColumnsRoot, child => child.tagName === 'iframe')
    const inferredColumnsPhone = findDeep(inferredColumnsRoot, child => String(child.className).includes('ps-iframe-device-iphone'))
    const inferredColumnsHeading = findDeep(inferredColumnsRoot, child => child.tagName === 'h2')
    assert(inferredColumnsLayout, 'renderSlideObject uses columns renderer when columns array is present')
    assert.strictEqual(inferredColumnsIframe.attributes.src, 'https://example.test/app', 'columns renderer supports iframe media columns')
    assert(inferredColumnsPhone, 'columns iframe column supports reusable iPhone frame')
    assert(inferredColumnsHeading.children.includes('Demo'), 'columns renderer supports copy columns next to iframe media')

    const columnsTarget = new FakeElement('section')
    const columnsSlide = mod.columns({ columns: [{ title: 'Tiny UI' }, { image: '/phone.png', fit: 'contain' }] })
    assert(columnsSlide.assets.includes('/phone.png'), 'columns helper tracks side image asset')
    columnsSlide(columnsTarget)
    const columnsRoot = columnsTarget.children[0]
    const columnsLayout = findDeep(columnsRoot, child => String(child.className).includes('ps-columns-layout'))
    const columnsCopy = findDeep(columnsRoot, child => String(child.className).includes('ps-columns-copy'))
    const columnsMedia = findDeep(columnsRoot, child => String(child.className).includes('ps-columns-media'))
    const columnsImage = findDeep(columnsRoot, child => child.tagName === 'img')
    const columnsHeading = findDeep(columnsRoot, child => child.tagName === 'h2')
    assert(columnsLayout, 'columns helper renders a named layout wrapper')
    assert.strictEqual(columnsLayout.style.width, '100%', 'columns layout fills the slide width')
    assert.strictEqual(columnsLayout.style.boxSizing, 'border-box', 'columns layout keeps padding inside the slide')
    assert.strictEqual(columnsLayout.style.minWidth, 0, 'columns layout can shrink grid columns')
    assert.strictEqual(columnsLayout.style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))', 'columns array defaults to an even two-column grid')
    assert.strictEqual(columnsLayout.style.gridTemplateRows, 'minmax(0, 1fr)', 'columns layout constrains the grid row to the slide height')
    assert.strictEqual(columnsLayout.style.gap, 'clamp(1.5rem, 3vw, 3.25rem)', 'columns slides use a responsive gap')
    assert.strictEqual(columnsLayout.style.padding, 'clamp(2rem, 5vh, 4.5rem) clamp(2rem, 5vw, 5rem)', 'columns slides use responsive bounded padding')
    assert.strictEqual(columnsCopy.style.textAlign, 'center', 'columns copy defaults centered inside its column')
    assert.strictEqual(columnsCopy.style.maxWidth, 'min(58rem, 100%)', 'columns copy has a sensible max width')
    assert(columnsHeading && columnsHeading.children.includes('Tiny UI'), 'columns helper renders title copy inside a column')
    assert.strictEqual(columnsMedia.style.width, '100%', 'columns media wrapper fills its grid cell')
    assert.strictEqual(columnsMedia.style.minWidth, 0, 'columns media wrapper can shrink inside the grid')
    assert.strictEqual(columnsMedia.style.minHeight, 0, 'columns media wrapper can shrink inside the grid row')
    assert.strictEqual(columnsMedia.style.alignItems, 'center', 'columns media wrapper centers image vertically by default')
    assert.strictEqual(columnsMedia.style.justifyContent, 'center', 'columns media wrapper centers image horizontally by default')
    assert.strictEqual(columnsImage.attributes.src, '/phone.png', 'columns image renders the configured side image')
    assert.strictEqual(columnsImage.style.maxHeight, 'min(82vh, 100%)', 'columns image default max height stays inside the padded slide')
    assert.strictEqual(columnsImage.style.objectFit, 'contain', 'columns image still preserves contain fitting')

    const nestedColumnsTarget = new FakeElement('section')
    const nestedColumnsSlide = mod.columns({
      columns: [
        { title: 'Outer' },
        {
          columns: [
            { image: '/nested-a.png', fit: 'contain' },
            { title: 'Nested' }
          ]
        }
      ]
    })
    assert(nestedColumnsSlide.assets.includes('/nested-a.png'), 'recursive columns track nested image assets')
    nestedColumnsSlide(nestedColumnsTarget)
    assert.strictEqual(countDeep(nestedColumnsTarget, child => String(child.className).includes('ps-columns-layout')), 2, 'recursive columns render nested column layouts')
    assert(findDeep(nestedColumnsTarget, child => child.tagName === 'h2' && child.children.includes('Nested')), 'recursive columns render nested title slides')
    assert(findDeep(nestedColumnsTarget, child => child.tagName === 'img' && child.attributes.src === '/nested-a.png'), 'recursive columns render nested image slides')

    const wideWidth = global.window.innerWidth
    const wideHeight = global.window.innerHeight
    global.window.innerWidth = 390
    global.window.innerHeight = 844
    const mobileColumnsTarget = new FakeElement('section')
    mod.columns({ columns: [{ title: 'Top' }, { title: 'Bottom' }] })(mobileColumnsTarget)
    const mobileColumnsLayout = findDeep(mobileColumnsTarget, child => String(child.className).includes('ps-columns-layout'))
    assert.strictEqual(mobileColumnsLayout.style.gridTemplateColumns, 'minmax(0, 1fr)', 'columns stack into one column on narrow/portrait viewports')
    assert.strictEqual(mobileColumnsLayout.style.gridTemplateRows, 'repeat(2, minmax(0, 1fr))', 'columns stack as rows on narrow/portrait viewports')
    global.window.innerWidth = wideWidth
    global.window.innerHeight = wideHeight

    const fittedVideoTarget = new FakeElement('section')
    mod.video('/demo.mp4', { fit: 'cover' })(fittedVideoTarget)
    const fittedVideo = findDeep(fittedVideoTarget, child => child.tagName === 'video')
    assert.strictEqual(fittedVideo.style.objectFit, 'cover', 'video helper honors fit for objectFit')

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
    mod.iframe('https://example.test/demo', { iframeTitle: 'Src test', navigationControls: false })(srcTarget)
    const srcRoot = srcTarget.children[0]
    const srcFrame = findDeep(srcRoot, child => child.tagName === 'iframe')
    assert.strictEqual(srcFrame.attributes.src, 'https://example.test/demo', 'iframe helper preserves normal src URLs')
    assert.strictEqual(srcFrame.style.width, '100%', 'normal iframe keeps full-shell width')
    assert.strictEqual(srcFrame.style.height, '100%', 'normal iframe keeps full-shell height')
    assert(!findDeep(srcRoot, child => String(child.className).includes('ps-iframe-nav-controls')), 'iframe navigation controls can be disabled')

    const phoneTarget = new FakeElement('section')
    mod.iframe('https://david.app/', { title: 'Phone demo', device: 'iphone' })(phoneTarget)
    const phoneRoot = phoneTarget.children[0]
    const phoneDevice = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-device-iphone'))
    const phoneControls = phoneRoot.children.find(child => String(child.className).includes('ps-iframe-nav-controls'))
    const phoneScreen = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-device-screen'))
    const phoneViewport = findDeep(phoneRoot, child => String(child.className).includes('ps-iframe-device-viewport'))
    const phoneFrame = findDeep(phoneRoot, child => child.tagName === 'iframe')
    assert(phoneDevice, 'iframe helper renders an iPhone-like device frame when requested')
    assert.strictEqual(phoneFrame.attributes.src, 'https://david.app/', 'phone-framed iframe preserves external src URL')
    assert(phoneScreen && phoneScreen.children.includes(phoneViewport), 'phone-framed iframe renders a logical viewport inside the rounded device screen')
    assert(phoneViewport && phoneViewport.children.includes(phoneFrame), 'phone-framed iframe renders inside the logical phone viewport')
    assert.strictEqual(phoneViewport.style.width, '390px', 'phone-framed iframe viewport uses iPhone-like logical width')
    assert.strictEqual(phoneViewport.style.height, '844px', 'phone-framed iframe viewport uses iPhone-like logical height')
    assert.strictEqual(phoneFrame.style.width, '390px', 'phone-framed iframe gets logical phone viewport width')
    assert.strictEqual(phoneFrame.style.height, '844px', 'phone-framed iframe gets logical phone viewport height')
    assert(phoneControls && !containsDeep(phoneDevice, phoneControls), 'phone-framed iframe keeps arrow controls outside/over the device frame')
    assert(!containsDeep(phoneFrame, phoneControls), 'phone-framed iframe keeps nav controls on the parent slide')

    const showcaseSpec = yaml.load(fs.readFileSync(path.join(root, 'examples', 'showcase', 'slides.yaml'), 'utf8'))
    assert(Array.isArray(showcaseSpec), 'showcase is a bare slide array')
    const showcaseSlides = slideArray(showcaseSpec)
    assert.strictEqual(showcaseSlides.length, 9, 'showcase splits the canonical story into focused moments')
    assert.strictEqual(mod.inferSlideType(showcaseSlides[0]), 'text', 'showcase shape 1 is title/default text')
    assert.strictEqual(showcaseSlides[0].title, 'Simple to start.', 'showcase opens with the simple-start story')
    assert.strictEqual(mod.inferSlideType(showcaseSlides[1]), 'text', 'showcase shape 2 is the remote checkpoint')
    assert(showcaseSlides[1].notes.join(' ').includes('phone') && showcaseSlides[1].notes.join(' ').includes('timers'), 'showcase remote checkpoint includes phone speaker notes')
    assert.strictEqual(mod.inferSlideType(showcaseSlides[2]), 'columns', 'showcase story 3 is a designed static-assets columns moment')
    assert.strictEqual(showcaseSlides[2].columns[0].image, '/github-render.png', 'showcase story 3 demonstrates the image primitive with purpose')
    assert.strictEqual(showcaseSlides[2].columns[1].title, 'One folder. Real assets.', 'showcase story 3 keeps static-asset copy sparse')
    assert.strictEqual(showcaseSlides[2].columns[1].bullets, undefined, 'showcase asset slide keeps detailed guidance out of projected bullets')
    assert.strictEqual(mod.inferSlideType(showcaseSlides[3]), 'video', 'showcase shape 4 is video')
    assert.strictEqual(mod.inferSlideType(showcaseSlides[4]), 'columns', 'showcase shape 5 is columns')
    assert.strictEqual(showcaseSlides[4].columns[1].bullets, undefined, 'showcase composition column does not render the old bullet list')
    assert.strictEqual(mod.inferSlideType(showcaseSlides[5]), 'text', 'showcase shape 6 is the remote story moment')
    assert.strictEqual(mod.inferSlideType(showcaseSlides[6]), 'iframe', 'showcase shape 7 is iframe')
    assert.strictEqual(showcaseSlides[6].iframe, 'https://david.app', 'showcase iframe loads david.app directly')
    assert(!Object.prototype.hasOwnProperty.call(showcaseSlides[6], 'srcdoc'), 'showcase iframe does not use conflicting srcdoc demo content')
    assert.strictEqual(mod.inferSlideType(showcaseSlides[7]), 'html', 'showcase shape 8 is html')
    assert.strictEqual(showcaseSlides[8].custom, 'particleField', 'showcase shape 9 is custom')
    assert(showcaseSlides.some(slide => slide.video === '/fractal-loop.mp4'), 'showcase includes video shape')
    assert(showcaseSlides.some(slide => slide.html && slide.html.includes('Bring your own markup')), 'showcase includes html shape')
    assert(showcaseSlides.some(slide => slide.custom === 'particleField'), 'showcase includes custom shape')
    assertNoPublicLegacyFields(showcaseSlides, 'showcase')

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

    const columnIframeTarget = new FakeElement('section')
    mod.columns({
      columns: [
        { iframe: 'https://example.test/column-app', device: 'iphone' },
        { title: 'Column copy' }
      ]
    })(columnIframeTarget)
    const columnIframeRoot = columnIframeTarget.children[0]
    const columnIframeFrame = findDeep(columnIframeRoot, child => child.tagName === 'iframe')
    const columnIframeDevice = findDeep(columnIframeRoot, child => String(child.className).includes('ps-iframe-device-iphone'))
    const columnIframeControls = findDeep(columnIframeRoot, child => String(child.className).includes('ps-iframe-nav-controls'))
    const columnIframePrevButton = findDeep(columnIframeRoot, child => String(child.className).includes('ps-iframe-nav-prev'))
    const columnIframeNextButton = findDeep(columnIframeRoot, child => String(child.className).includes('ps-iframe-nav-next'))
    assert.strictEqual(columnIframeFrame.attributes.src, 'https://example.test/column-app', 'columns iframe media preserves external src URL')
    assert(columnIframeControls && columnIframeControls.style.pointerEvents === 'none', 'columns iframe media renders parent-level navigation controls by default')
    assert(columnIframePrevButton && columnIframePrevButton.style.pointerEvents === 'auto', 'columns iframe previous arrow remains clickable')
    assert(columnIframeNextButton && columnIframeNextButton.style.pointerEvents === 'auto', 'columns iframe next arrow remains clickable')
    const columnIframeViewport = findDeep(columnIframeRoot, child => String(child.className).includes('ps-iframe-device-viewport'))
    assert(columnIframeDevice && !containsDeep(columnIframeDevice, columnIframeControls), 'columns iframe keeps arrow controls outside the device frame')
    assert(columnIframeViewport && columnIframeViewport.children.includes(columnIframeFrame), 'columns phone iframe uses a logical phone viewport wrapper')
    assert.strictEqual(columnIframeFrame.style.width, '390px', 'columns phone iframe gets logical phone viewport width')
    assert.strictEqual(columnIframeFrame.style.height, '844px', 'columns phone iframe gets logical phone viewport height')
    assert(!containsDeep(columnIframeFrame, columnIframeControls), 'columns iframe keeps nav controls outside the iframe element')
    columnIframePrevButton.onclick(fakeKey('click'))
    columnIframeNextButton.onclick(fakeKey('click'))
    assert.strictEqual(prevCount, 3, 'columns iframe previous arrow calls PowerSlides.prevSlide')
    assert.strictEqual(nextCount, 3, 'columns iframe next arrow calls PowerSlides.nextSlide')

    const disabledColumnIframeTarget = new FakeElement('section')
    mod.columns({
      navigationControls: false,
      columns: [
        { iframe: 'https://example.test/no-column-controls' },
        { title: 'No controls' }
      ]
    })(disabledColumnIframeTarget)
    assert(!findDeep(disabledColumnIframeTarget, child => String(child.className).includes('ps-iframe-nav-controls')), 'columns iframe navigation controls can be disabled')

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

function countDeep (root, predicate) {
  if (!root) return 0
  let count = predicate(root) ? 1 : 0
  for (const child of root.children || []) {
    count += countDeep(child, predicate)
  }
  return count
}

function createFakeDocument () {
  const document = {
    body: new FakeElement('body'),
    createdElements: [],
    createElement (tagName) {
      const el = new FakeElement(tagName)
      this.createdElements.push(el)
      return el
    },
    createTextNode (text) {
      return String(text)
    }
  }
  return document
}

function createFakeWindow () {
  const win = {
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
    createdImages: [],
    addEventListener (name, fn) {
      this.listeners[name] = this.listeners[name] || []
      this.listeners[name].push(fn)
    }
  }
  win.Image = function FakeImage () {
    this.onload = null
    this.onerror = null
    this.src = ''
    win.createdImages.push(this)
  }
  return win
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
    if (tagName === 'video') {
      this.loadCount = 0
      this.load = () => {
        this.loadCount++
        setImmediate(() => {
          if (typeof this.onloadeddata === 'function') this.onloadeddata()
          this.dispatch('loadeddata')
        })
      }
    }
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
