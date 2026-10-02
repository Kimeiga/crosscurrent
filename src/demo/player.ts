import { rank, pointsAt } from '../engine.ts';
import { cardIds, timeline, sampleDemo, WIDTH, HEIGHT, type Frame } from './timeline.ts';

let instanceId = 0;
const frontNames = ['Left', 'Middle', 'Right'];
const text = (x: number, y: number, value: string, extra = '') =>
  `<text x="${x}" y="${y}" ${extra}>${value}</text>`;

/** One clipped SVG stage and 26 persistent card nodes. Only transforms change
 * during travel. No opacity animation, repeated DOM replacement, or timers. */
export function mountGameDemo(root: HTMLElement) {
  const clip = `demo-clip-${++instanceId}`;
  root.classList.add('game-demo');
  root.innerHTML = `
    <div class="demo-heading">
      <span>Example game · turn <b data-turn>1</b> of 12</span>
      <div class="demo-controls">
        <button type="button" data-pause aria-label="Pause demo" title="Pause demo">Ⅱ</button>
        <button type="button" data-next aria-label="Next demo turn" title="Next turn">→</button>
        <button type="button" data-restart aria-label="Restart demo" title="Restart demo">↺</button>
      </div>
    </div>
    <svg class="demo-stage" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="A complete twelve-turn example game. Player 2 plays hearts from the top; Player 1 plays spades from the bottom. Cards slide onto three fronts, move between fronts, return to hand, or leave after scoring.">
      <defs><clipPath id="${clip}"><rect x="0" y="30" width="480" height="300" rx="4"/></clipPath></defs>
      <g class="demo-rails">
        ${text(4, 19, 'Player 2 ♥', 'class="demo-them"')}
        ${text(104, 19, '', 'data-order="1" class="demo-order demo-them"')}
        ${text(476, 21, '0', 'data-score="1" text-anchor="end" class="demo-total demo-them"')}
        ${text(4, 352, 'Player 1 ♠', 'class="demo-you"')}
        ${text(104, 352, '', 'data-order="0" class="demo-order demo-you"')}
        ${text(476, 354, '0', 'data-score="0" text-anchor="end" class="demo-total demo-you"')}
      </g>
      <g clip-path="url(#${clip})">
        ${frontNames.map((name, f) => `<g class="demo-front demo-front-${f}">
          <rect x="${f * 160 + 2}" y="30" width="156" height="300" rx="3"/>
          <path class="demo-divider" d="M${f * 160 + 12} 162h136M${f * 160 + 12} 198h136"/>
          ${text(f * 160 + 80, 185, name, 'text-anchor="middle" class="demo-front-label"')}
          ${text(f * 160 + 80, 153, '0', `data-strength="1:${f}" text-anchor="middle" class="demo-strength demo-them"`)}
          ${text(f * 160 + 80, 221, '0', `data-strength="0:${f}" text-anchor="middle" class="demo-strength demo-you"`)}
          ${text(f * 160 + 133, 151, '', `data-award="1:${f}" text-anchor="middle" class="demo-award demo-them"`)}
          ${text(f * 160 + 133, 220, '', `data-award="0:${f}" text-anchor="middle" class="demo-award demo-you"`)}
        </g>`).join('')}
        <g class="demo-cards">
          ${cardIds.map(({ seat, card, id }) => `<g data-card="${id}" class="demo-card ${seat === 0 ? 'demo-card-you' : 'demo-card-them'}" transform="translate(240 ${seat === 0 ? 460 : -100})">
            <rect class="demo-card-shadow" x="-25" y="-29" width="52" height="68" rx="4"/>
            <rect class="demo-card-face" x="-26" y="-34" width="52" height="68" rx="4"/>
            ${text(-20, -7, rank(card), 'class="demo-rank"')}
            ${text(-19, 14, seat === 0 ? '♠' : '♥', 'class="demo-suit"')}
            ${text(19, 26, String(card), 'text-anchor="end" class="demo-value"')}
          </g>`).join('')}
        </g>
      </g>
    </svg>
    <div class="demo-footline"><span data-phase>Same cards, secret orders.</span><span data-checkpoint>Scores on turns 4, 8, 12</span></div>
    <div class="demo-track" aria-hidden="true">${Array.from({ length: 12 }, (_, i) => `<span data-tick="${i + 1}" class="${pointsAt(i + 1) ? 'checkpoint' : ''}"></span>`).join('')}</div>
    <p class="sr-only">This scripted example finishes ${timeline.final.scores[0]} points to ${timeline.final.scores[1]} and repeats. Pause, advance by one turn, or restart with the controls above. Both players start with the same cards. Scoring happens after turns four, eight and twelve.</p>
  `;
  const get = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const cards = new Map(cardIds.map(({ id }) => [id, get<SVGGElement>(`[data-card="${id}"]`)]));
  const scoreNodes = [0, 1].map(seat => get<SVGTextElement>(`[data-score="${seat}"]`));
  const orderNodes = [0, 1].map(seat => get<SVGTextElement>(`[data-order="${seat}"]`));
  const strengths = [0, 1].map(seat => frontNames.map((_, f) => get<SVGTextElement>(`[data-strength="${seat}:${f}"]`)));
  const awards = [0, 1].map(seat => frontNames.map((_, f) => get<SVGTextElement>(`[data-award="${seat}:${f}"]`)));
  const ticks = Array.from(root.querySelectorAll<HTMLElement>('[data-tick]'));
  const pause = get<HTMLButtonElement>('[data-pause]');
  const next = get<HTMLButtonElement>('[data-next]');
  const restart = get<HTMLButtonElement>('[data-restart]');
  const phaseNode = get<HTMLElement>('[data-phase]');
  const checkpointNode = get<HTMLElement>('[data-checkpoint]');
  const turnNode = get<HTMLElement>('[data-turn]');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = media.matches;
  let inView = true;
  let pageVisible = !document.hidden;
  let disposed = false;
  let elapsed = media.matches ? timeline.frames.find(f => f.turn === 4 && f.phase === 'score')!.start : 0;
  let request = 0;
  let previousTime: number | null = null;
  let lastFrame: Frame | null = null;

  function render() {
    const sample = sampleDemo(elapsed);
    const { frame } = sample;
    for (const { id } of cardIds) {
      const p = sample.poses[id];
      cards.get(id)!.setAttribute('transform', `translate(${p.x.toFixed(3)} ${p.y.toFixed(3)}) rotate(${p.rotation.toFixed(3)})`);
    }
    if (frame === lastFrame) return;
    lastFrame = frame;
    root.dataset.turn = String(frame.turn);
    root.dataset.phase = frame.phase;
    turnNode.textContent = String(Math.max(1, frame.turn));
    ticks.forEach((node, index) => {
      node.classList.toggle('done', index < frame.turn - 1 || frame.phase === 'winner');
      node.classList.toggle('current', index === frame.turn - 1 && frame.phase !== 'winner');
    });
    const captions: Record<Frame['phase'], string> = {
      ready: 'Both players start with Ace to King.', commit: 'Both orders locked in secret.',
      move: 'Revealed together.', settle: 'Deploy, Shift or Recall: one order each.',
      score: `Scoring: ${pointsAt(frame.turn)} ${pointsAt(frame.turn) === 1 ? 'point' : 'points'} per front won`,
      clear: pointsAt(frame.turn) ? 'Highest card on each front is spent.' : 'Next turn.',
      hold: 'Next turn.', winner: `Player ${timeline.final.scores[0] > timeline.final.scores[1] ? 1 : 2} wins, ${timeline.final.scores.join('–')}`, reset: 'Starting again.',
    };
    phaseNode.textContent = captions[frame.phase];
    checkpointNode.textContent = frame.phase === 'winner' || frame.phase === 'reset' ? 'Repeats' : 'Scores on turns 4, 8, 12';
    for (const seat of [0, 1]) {
      scoreNodes[seat].textContent = String(sample.visible.scores[seat]);
      const order = frame.orders?.[seat];
      orderNodes[seat].textContent = frame.phase === 'commit' ? 'Locked in' : order && frame.phase !== 'hold'
        ? `${order.kind === 'deploy' ? 'Deploy' : order.kind === 'shift' ? 'Shift' : 'Recall'} ${rank(order.card)}${order.kind === 'recall' ? '' : ` to ${frontNames[order.front]}`}` : '';
      for (let f = 0; f < 3; f++) {
        strengths[seat][f].textContent = String(sample.strengths[seat][f]);
        const wins = frame.phase === 'score' && sample.strengths[seat][f] > sample.strengths[1 - seat][f];
        awards[seat][f].textContent = wins ? `+${pointsAt(frame.turn)}` : '';
        strengths[seat][f].classList.toggle('demo-scoring', wins);
      }
    }
  }

  function tick(now: number) {
    request = 0;
    if (disposed || paused || !inView || !pageVisible) return;
    if (previousTime !== null) elapsed += now - previousTime;
    previousTime = now;
    render();
    request = requestAnimationFrame(tick);
  }

  function sync() {
    cancelAnimationFrame(request);
    request = 0;
    previousTime = null;
    pause.textContent = paused ? '▷' : 'Ⅱ';
    pause.setAttribute('aria-label', paused ? 'Play demo' : 'Pause demo');
    pause.title = paused ? 'Play demo' : 'Pause demo';
    root.dataset.paused = String(paused);
    if (!disposed && !paused && inView && pageVisible) request = requestAnimationFrame(tick);
  }

  function toggle() { paused = !paused; sync(); }
  function advance() {
    paused = true;
    const current = sampleDemo(elapsed).frame.turn;
    // An explicit step shows settled cards, including post-scoring exhaustion.
    elapsed = current >= 12 ? 0 : timeline.frames.find(f => f.turn === current + 1 && f.phase === 'hold')!.start;
    lastFrame = null;
    render();
    sync();
  }
  function reset() { elapsed = 0; lastFrame = null; render(); sync(); }
  function visibility() { pageVisible = !document.hidden; sync(); }
  function preference() {
    if (media.matches) {
      paused = true;
      const current = sampleDemo(elapsed).frame.turn;
      elapsed = timeline.frames.find(f => f.turn === Math.max(1, current) && f.phase === 'hold')!.start;
      lastFrame = null;
      render();
      sync();
    }
  }
  pause.addEventListener('click', toggle);
  next.addEventListener('click', advance);
  restart.addEventListener('click', reset);
  document.addEventListener('visibilitychange', visibility);
  media.addEventListener('change', preference);
  const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); });
  observer.observe(root);
  render();
  sync();

  return {
    destroy() {
      disposed = true;
      cancelAnimationFrame(request);
      observer.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      media.removeEventListener('change', preference);
      pause.removeEventListener('click', toggle);
      next.removeEventListener('click', advance);
      restart.removeEventListener('click', reset);
      root.replaceChildren();
    },
  };
}
