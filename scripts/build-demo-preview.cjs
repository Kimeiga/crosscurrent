/** Standalone preview uses the production animation modules, not a second animation. */
const fs = require('node:fs');
const path = require('node:path');
const ts = require(process.env.TYPESCRIPT_PATH || 'typescript');
const root = path.resolve(__dirname, '..');
const sourceFiles = ['src/engine.ts', 'src/demo/timeline.ts', 'src/demo/player.ts'];
const modules = sourceFiles.map(file => {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return `${JSON.stringify(file)}: function(module, exports, require) {\n${compiled}\n}`;
}).join(',\n');
const css = fs.readFileSync(path.join(root, 'src/demo/demo.css'), 'utf8');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crosscurrent · Full-game animation preview</title>
<style>
:root { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #e9ece6; background: #101214; font-size: 16px; line-height: 1.45; --bg: #101214; --paper: #e9ece6; --ink: #171c1b; --accent: #d3dfbe; --muted: #a3aaa8; --line: #353a3c; }
* { box-sizing: border-box; } body { margin: 0; min-width: 320px; } h1,h2,h3,p { margin: 0; } button, a { font: inherit; color: inherit; } button { background: transparent; border: 0; cursor: pointer; touch-action: manipulation; } a { text-decoration: none; } button:focus-visible,a:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.shell { width: min(100%,1320px); margin: auto; padding-inline: clamp(14px,3.4vw,48px); }
.masthead { display: flex; justify-content: space-between; align-items: center; gap: 16px; min-height: 88px; border-bottom: 1px solid var(--line); }
.brand { font-size: 17px; font-weight: 650; letter-spacing: .04em; } .brand small { display: block; font-size: 10px; color: var(--muted); font-weight: 400; letter-spacing: .15em; }
.help { font-size: 15px; min-height: 44px; display: inline-flex; align-items: center; }
.eyebrow { font-size: 11px; font-weight: 500; letter-spacing: .1em; line-height: 1.6; color: var(--muted); }
.status-dot { display: inline-block; width: 6px; height: 6px; margin-right: 7px; border-radius: 50%; background: var(--accent); }
.primary,.secondary { display: inline-flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 50px; padding: 12px 18px; font-size: 16px; font-weight: 550; border-radius: 3px; }
.primary { color: var(--ink); background: var(--accent); border: 1px solid var(--accent); } .secondary { border: 1px solid #596261; }
.landing { display: grid; grid-template-columns: 1.05fr 1fr; column-gap: clamp(36px,7vw,100px); align-items: center; padding-top: clamp(26px,4vw,52px); }
.intro { align-self: center; padding-bottom: 24px; } .intro h1 { font-size: clamp(44px,5.7vw,78px); line-height: .99; letter-spacing: -.065em; font-weight: 500; margin-block: 20px 24px; } .intro h1 span { color: var(--accent); }
.hero-play { min-width: 220px; } .game-demo { margin-bottom: 24px; }
.play-options { grid-column: 1/-1; padding-block: 16px 26px; } .section-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding-block: 12px 18px; } .section-heading h2 { font-size: 20px; font-weight: 500; } .section-heading span { font-size: 12px; color: var(--muted); }
.mode-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); border-block: 1px solid var(--line); } .mode-card { display: grid; gap: 14px; padding: 24px; } .mode-card:first-child { padding-left: 0; } .mode-card:last-child { padding-right: 0; } .mode-card + .mode-card { border-left: 1px solid var(--line); } .mode-card h3 { font-size: 25px; font-weight: 500; letter-spacing: -.03em; } .mode-heading { font-size: 10px; color: var(--muted); letter-spacing: .1em; } .mode-card p { color: var(--muted); font-size: 14px; }
footer { padding-block: 10px 24px; color: var(--muted); font-size: 11px; } .sr-only { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); }
@media(max-width:760px) { .masthead { min-height: 66px; } .brand { font-size: 15px; } .brand small { font-size: 8px; } .help { font-size: 14px; } .landing { grid-template-columns: 1fr; padding-top: 18px; } .intro { padding-bottom: 12px; } .intro h1 { font-size: clamp(40px,11vw,56px); margin-block: 13px 17px; } .hero-play { width: 100%; min-width: 0; } .game-demo { margin-block: 2px 20px; } .play-options { padding-top: 0; } .mode-grid { grid-template-columns: 1fr; } .mode-card,.mode-card:first-child,.mode-card:last-child { padding: 22px 0; } .mode-card + .mode-card { border-left: 0; border-top: 1px solid var(--line); } .section-heading h2 { font-size: 18px; } }
${css}
</style></head><body><div class="shell">
<header class="masthead"><a class="brand" href="https://crosscurrent-evvi8n.v2.appdeploy.ai/">CROSSCURRENT<small>SEA / LAND / AIR</small></a><a class="help" href="https://crosscurrent-evvi8n.v2.appdeploy.ai/">How to play ↗</a></header>
<main class="landing"><section class="intro"><p class="eyebrow"><span class="status-dot"></span>A SIMULTANEOUS STRATEGY GAME FOR TWO</p><h1>An equal start.<br><span>Make it yours.</span></h1><a class="primary hero-play" href="https://crosscurrent-evvi8n.v2.appdeploy.ai/" title="Open the live Crosscurrent game">Play vs AI <span>→</span></a></section>
<section id="game-demo" aria-label="Animated Crosscurrent demonstration"></section>
<section class="play-options"><div class="section-heading"><h2>Choose your table</h2><span>No account needed</span></div><div class="mode-grid">
<section class="mode-card"><div class="mode-heading">01 / SOLO</div><h3>Read the machine.</h3><p>Casual · Tactical · Deep</p><a class="primary" href="https://crosscurrent-evvi8n.v2.appdeploy.ai/">Play vs AI <span>→</span></a></section>
<section class="mode-card"><div class="mode-heading">02 / SAME DEVICE</div><h3>Across the table.</h3><p>Two players, one screen.</p><a class="secondary" href="https://crosscurrent-evvi8n.v2.appdeploy.ai/">Local 2-player <span>→</span></a></section>
<section class="mode-card"><div class="mode-heading">03 / ONLINE</div><h3>Any distance.</h3><p>Private invitation.</p><a class="secondary" href="https://crosscurrent-evvi8n.v2.appdeploy.ai/">Invite a friend <span>→</span></a></section>
</div></section></main><footer>HOMEPAGE PREVIEW · PLAY BUTTONS OPEN THE EXISTING LIVE APP</footer></div>
<script>(function() {
const modules = {${modules}};
const cache = {};
function load(id) {
  if (cache[id]) return cache[id].exports;
  const module = cache[id] = { exports: {} };
  modules[id](module, module.exports, function(specifier) {
    const parts = id.split('/'); parts.pop();
    for (const part of specifier.split('/')) {
      if (part === '..') parts.pop(); else if (part !== '.') parts.push(part);
    }
    return load(parts.join('/'));
  });
  return module.exports;
}
load('src/demo/player.ts').mountGameDemo(document.getElementById('game-demo'));
})();</script></body></html>`;
const target = process.argv[2] || path.join(root, 'docs/homepage-preview.html');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, html);
console.log(target);
