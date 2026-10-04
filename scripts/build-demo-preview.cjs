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
const css = ['src/styles.css', 'src/demo/demo.css'].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const app = 'https://hakanalpay.com/crosscurrent/';
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crosscurrent · example game preview</title>
<style>
${css}
.home { width: min(100%, 1120px); margin: 0 auto; padding: clamp(20px, 5vw, 56px) var(--gutter) 40px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); gap: clamp(28px, 6vw, 80px); align-items: center; }
.wordmark { font-family: var(--serif); font-size: clamp(44px, 7vw, 76px); font-weight: 700; letter-spacing: -.02em; line-height: 1; }
.lede { margin-top: 18px; font-size: clamp(17px, 1.6vw, 19px); color: var(--ink-2); max-width: 30em; }
.actions { display: grid; gap: 10px; margin-top: 28px; max-width: 420px; }
.actions a { text-decoration: none; min-height: 54px; font-size: 17px; }
.note { margin-top: 18px; font-size: 13px; color: var(--ink-3); }
@media (max-width: 860px) { .home { grid-template-columns: minmax(0, 1fr); } .actions { max-width: none; } }
</style></head><body>
<main class="home"><section><h1 class="wordmark">Crosscurrent</h1>
<p class="lede">A card game for two with no shuffle and no dice. You both start with the same thirteen cards, choose each move in secret, and reveal together.</p>
<div class="actions"><a class="btn primary" href="${app}">Play the computer</a><a class="btn" href="${app}">Play a friend online</a><a class="btn" href="${app}#/learn">Learn by playing</a></div>
<p class="note">Standalone preview of the start-screen animation. The links open the live app.</p></section>
<section id="game-demo" aria-label="A complete example game"></section></main>
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
