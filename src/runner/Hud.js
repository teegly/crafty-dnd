// DOM overlay for the game: start screen (Play), live HUD (score / cans / lives),
// and the game-over screen (final score, high score, restart, back to ambient).
//
// DOM is used instead of in-canvas text: it stays crisp at any resolution, costs
// nothing to render, and is trivial to style. The overlay fills the runner
// container and is pointer-events:none except for its buttons, so it never eats
// gameplay input.

const STYLE_ID = 'cr-hud-style';

// Hearts are drawn as fixed-width inline SVGs rather than the ❤ emoji: emoji glyph
// widths vary by platform (wide colour emoji on Windows), which pushed the lives row
// past the clipped right edge. An SVG has a known width so the row always fits.
const HEART_SVG =
  '<svg class="cr-heart" viewBox="0 0 32 29" aria-hidden="true">' +
  '<path d="M16 28.6C6 21 2 16 2 9.5 2 5.4 5.4 2 9.5 2c2.6 0 5 1.4 6.5 3.6C17.5 3.4 19.9 2 22.5 2 26.6 2 30 5.4 30 9.5 30 16 26 21 16 28.6z" fill="currentColor"/>' +
  '</svg>';

const CSS = `
.cr-hud {
  position: absolute; inset: 0; z-index: 10;
  pointer-events: none;
  font-family: system-ui, sans-serif; color: #f3f7e8;
  -webkit-user-select: none; user-select: none;
}
.cr-topbar {
  position: absolute; top: 0; left: 0; right: 0;
  box-sizing: border-box;
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 12px 16px;
  font-weight: 700; letter-spacing: 0.02em;
  text-shadow: 0 2px 6px rgba(0,0,0,0.6);
}
/* Left group can shrink/clip on tiny screens; the lives group is pinned to the
   right so the hearts can never be pushed off the edge. */
.cr-topbar .cr-left {
  display: flex; align-items: baseline; gap: 12px;
  min-width: 0; overflow: hidden; white-space: nowrap;
}
.cr-topbar .cr-lives { flex: 0 0 auto; display: inline-flex; align-items: center; color: #ff6b6b; }
.cr-topbar .cr-heart { width: clamp(15px, 2.2vmin, 20px); height: auto; margin-left: 4px; display: block; filter: drop-shadow(0 1px 3px rgba(0,0,0,0.6)); }
.cr-topbar .cr-score { font-size: clamp(16px, 2.6vmin, 26px); }
.cr-topbar .cr-cans { font-size: clamp(14px, 2.2vmin, 20px); color: #ffe08a; }
.cr-topbar .cr-dist { font-size: clamp(11px, 1.8vmin, 16px); opacity: 0.8; font-weight: 600; }

.cr-screen {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 16px; text-align: center; padding: 24px;
  background: radial-gradient(ellipse at center, rgba(16,22,13,0.55), rgba(16,22,13,0.85));
  backdrop-filter: blur(2px);
}
.cr-screen h1 {
  margin: 0; font-size: clamp(28px, 7vmin, 64px); font-weight: 800;
  letter-spacing: 0.01em; text-shadow: 0 3px 12px rgba(0,0,0,0.7);
}
.cr-screen .cr-sub { margin: 0; opacity: 0.85; font-size: clamp(13px, 2.4vmin, 20px); }
.cr-screen .cr-final { font-size: clamp(20px, 4vmin, 40px); font-weight: 700; }
.cr-screen .cr-final .cr-hi { display: block; font-size: 0.6em; opacity: 0.85; font-weight: 600; margin-top: 6px; }
.cr-screen .cr-best { color: #ffe08a; font-weight: 800; font-size: clamp(15px, 2.8vmin, 24px); }
.cr-hint { opacity: 0.8; font-size: clamp(12px, 2.2vmin, 18px); }

.cr-btn {
  pointer-events: auto; cursor: pointer;
  border: 0; border-radius: 999px;
  padding: 12px 30px; margin: 4px;
  font-family: inherit; font-weight: 800; font-size: clamp(15px, 2.8vmin, 22px);
  color: #14210f; background: linear-gradient(180deg, #cfe88a, #9ec45a);
  box-shadow: 0 6px 18px rgba(0,0,0,0.45); transition: transform .08s ease, filter .08s ease;
}
.cr-btn:hover { filter: brightness(1.06); }
.cr-btn:active { transform: translateY(1px) scale(0.98); }
.cr-btn.cr-ghost { background: rgba(255,255,255,0.12); color: #f3f7e8; box-shadow: none; font-weight: 700; padding: 9px 22px; }

.cr-hidden { display: none !important; }

.cr-flash {
  position: absolute; inset: 0; z-index: 20;
  background: radial-gradient(ellipse at center, rgba(223,233,184,0.0), rgba(223,233,184,0.0));
  pointer-events: none; opacity: 0;
}
.cr-flash.cr-go { animation: cr-flash-anim 0.5s ease-out; }
@keyframes cr-flash-anim {
  0% { opacity: 0; background: rgba(223,233,184,0); }
  35% { opacity: 1; background: rgba(223,233,184,0.5); }
  100% { opacity: 0; background: rgba(223,233,184,0); }
}
`;

export class Hud {
  // callbacks: { onPlay, onRestart, onBack }
  constructor(container, callbacks = {}) {
    this.callbacks = callbacks;
    injectStyle();

    const root = document.createElement('div');
    root.className = 'cr-hud';
    root.innerHTML = `
      <div class="cr-topbar cr-hidden">
        <div class="cr-left">
          <span class="cr-score">0</span>
          <span class="cr-dist">0 m</span>
          <span class="cr-cans">🥤 0</span>
        </div>
        <div class="cr-lives"></div>
      </div>
      <div class="cr-screen cr-start">
        <h1>Crafty Runner</h1>
        <p class="cr-sub">Collect Pepsi · dodge enemies · pick your turns</p>
        <button class="cr-btn cr-play">▶ Play</button>
        <p class="cr-hint">← → switch lanes · ↑ / space jump · ↓ slide</p>
      </div>
      <div class="cr-screen cr-over cr-hidden">
        <h1>Run Over</h1>
        <div class="cr-final"></div>
        <button class="cr-btn cr-restart">↻ Play again</button>
        <button class="cr-btn cr-ghost cr-back">Back to ambient</button>
      </div>
      <div class="cr-flash"></div>
    `;
    container.appendChild(root);

    this.root = root;
    this.topbar = root.querySelector('.cr-topbar');
    this.scoreEl = root.querySelector('.cr-score');
    this.distEl = root.querySelector('.cr-dist');
    this.cansEl = root.querySelector('.cr-cans');
    this.livesEl = root.querySelector('.cr-lives');
    this.startScreen = root.querySelector('.cr-start');
    this.overScreen = root.querySelector('.cr-over');
    this.finalEl = root.querySelector('.cr-final');
    this.flashEl = root.querySelector('.cr-flash');

    root.querySelector('.cr-play').addEventListener('click', () => this.callbacks.onPlay?.());
    root.querySelector('.cr-restart').addEventListener('click', () => this.callbacks.onRestart?.());
    root.querySelector('.cr-back').addEventListener('click', () => this.callbacks.onBack?.());

    // Cache last-rendered values so update() only touches the DOM on change.
    this._last = { score: -1, dist: -1, cans: -1, lives: -1 };
  }

  showStart() {
    this.topbar.classList.add('cr-hidden');
    this.overScreen.classList.add('cr-hidden');
    this.startScreen.classList.remove('cr-hidden');
  }

  showHud() {
    this.startScreen.classList.add('cr-hidden');
    this.overScreen.classList.add('cr-hidden');
    this.topbar.classList.remove('cr-hidden');
    this._last = { score: -1, dist: -1, cans: -1, lives: -1 };
  }

  showGameOver(gs) {
    this.topbar.classList.add('cr-hidden');
    this.startScreen.classList.add('cr-hidden');
    this.finalEl.innerHTML =
      `Score ${gs.score}` +
      (gs.newHighScore
        ? `<span class="cr-best">★ New best!</span>`
        : `<span class="cr-hi">Best ${gs.highScore}</span>`);
    this.overScreen.classList.remove('cr-hidden');
  }

  // Update live values; only writes to the DOM when a value actually changed.
  update(gs) {
    if (gs.score !== this._last.score) {
      this.scoreEl.textContent = String(gs.score);
      this._last.score = gs.score;
    }
    const dist = Math.floor(gs.distance);
    if (dist !== this._last.dist) {
      this.distEl.textContent = `${dist} m`;
      this._last.dist = dist;
    }
    if (gs.cans !== this._last.cans) {
      this.cansEl.textContent = `🥤 ${gs.cans}`;
      this._last.cans = gs.cans;
    }
    if (gs.lives !== this._last.lives) {
      this.livesEl.innerHTML = HEART_SVG.repeat(Math.max(0, gs.lives));
      this._last.lives = gs.lives;
    }
  }

  // Quick light pulse to mask the rebase seam during a turn swing.
  flash() {
    this.flashEl.classList.remove('cr-go');
    void this.flashEl.offsetWidth; // force reflow so the animation restarts
    this.flashEl.classList.add('cr-go');
  }

  dispose() {
    this.root.remove();
  }
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
