// DOM overlay for the game: start screen (Play), live HUD (score / cans / lives),
// and the game-over screen (final score, high score, restart, back to ambient).
//
// DOM is used instead of in-canvas text: it stays crisp at any resolution, costs
// nothing to render, and is trivial to style. The overlay fills the runner
// container and is pointer-events:none except for its buttons, so it never eats
// gameplay input.

import { assetUrl } from './util.js';
import { GAME } from './GameState.js';

const STYLE_ID = 'cr-hud-style';

// Pixel-art heart sprites: a full heart per remaining life, an empty heart for each
// lost one, so the player always sees their max capacity (GAME.LIVES). Fixed-width
// images keep the lives row from being pushed past the clipped right edge.
const HEART_FULL = assetUrl('/assets/ui/heart-full.png');
const HEART_EMPTY = assetUrl('/assets/ui/heart-empty.png');

// The book-frame background used by the ambient buttons, reused so the game buttons
// (Play / Play again) match. assetUrl makes it base-path correct on deploy.
const FRAME_URL = assetUrl('/assets/ui/travel-book/frame-select.png');

const CSS = `
.cr-hud {
  position: absolute; inset: 0; z-index: 10;
  pointer-events: none;
  /* Readable pixel font for the live readout/screens; titles + buttons override to
     the chunkier Thaleah Fat (see below) to match the ambient UI. */
  font-family: "Minecraft", system-ui, sans-serif; color: #f3f7e8;
  -webkit-user-select: none; user-select: none;
}
.cr-topbar {
  position: absolute; top: 0; left: 0; right: 0;
  box-sizing: border-box;
  display: flex; align-items: center; justify-content: space-between;
  gap: 10px; padding: 12px 16px;
  font-weight: 400; letter-spacing: 0.02em;
  text-shadow: 0 2px 6px rgba(0,0,0,0.6);
}
/* Left group can shrink/clip on tiny screens; the lives group is pinned to the
   right so the hearts can never be pushed off the edge. */
.cr-topbar .cr-left {
  display: flex; align-items: baseline; gap: 12px;
  min-width: 0; overflow: hidden; white-space: nowrap;
}
.cr-topbar .cr-lives { flex: 0 0 auto; display: inline-flex; align-items: center; color: #ff6b6b; }
.cr-topbar .cr-heart { width: clamp(18px, 2.6vmin, 24px); height: auto; margin-left: 3px; display: block; image-rendering: pixelated; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
.cr-topbar .cr-heart--empty { opacity: 0.9; }
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
  margin: 0; font-family: "Thaleah Fat", "Minecraft", sans-serif;
  font-size: clamp(28px, 7vmin, 64px); font-weight: 400;
  letter-spacing: 0.01em; text-shadow: 0 3px 12px rgba(0,0,0,0.7);
}
.cr-screen .cr-sub { margin: 0; opacity: 0.85; font-size: clamp(13px, 2.4vmin, 20px); }
.cr-screen .cr-final { font-size: clamp(20px, 4vmin, 40px); font-weight: 700; }
.cr-screen .cr-final .cr-hi { display: block; font-size: 0.6em; opacity: 0.85; font-weight: 600; margin-top: 6px; }
.cr-screen .cr-best { color: #ffe08a; font-weight: 800; font-size: clamp(15px, 2.8vmin, 24px); }
.cr-hint { opacity: 0.8; font-size: clamp(12px, 2.2vmin, 18px); }

/* Match the ambient book-frame buttons (TRAVEL / RUN CRAFTY RUN): same frame image,
   pixel font and ink colour, no green pill. */
.cr-btn {
  pointer-events: auto; cursor: pointer;
  border: 0; padding: 14px 34px; margin: 6px;
  font-family: "Thaleah Fat", system-ui, sans-serif; font-weight: 400;
  font-size: clamp(18px, 3.4vmin, 30px); line-height: 1;
  color: #2b2013;
  background-color: transparent;
  background-image: url("${FRAME_URL}");
  background-repeat: no-repeat; background-size: 100% 100%;
  image-rendering: pixelated;
  text-shadow: 0 1px rgba(255, 244, 200, 0.65);
  transition: transform .08s ease, filter .08s ease;
}
.cr-btn:hover { filter: brightness(1.06); }
.cr-btn:active { transform: translateY(1px) scale(0.98); }
/* The secondary "Back" stays a subtle ghost (no frame) for visual hierarchy. */
.cr-btn.cr-ghost {
  background-image: none; background-color: rgba(255,255,255,0.12);
  border-radius: 999px; color: #f3f7e8; text-shadow: none;
  font-size: clamp(13px, 2.4vmin, 18px); padding: 9px 22px;
}

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
        <h1>Run Crafty Run</h1>
        <p class="cr-sub">Collect Pepsi · dodge enemies · pick your turns</p>
        <button class="cr-btn cr-play">▶ Play</button>
        <p class="cr-hint">← → switch lanes · ↑ / space jump · ↓ slide</p>
        <button class="cr-btn cr-ghost cr-start-back">Back</button>
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
    root.querySelector('.cr-start-back').addEventListener('click', () => this.callbacks.onBack?.());
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

  // Passive ambient: hide every game screen so the visualisation shows through. The
  // run is started from the "Run Crafty Run" button, not a covering Play overlay.
  showAmbient() {
    this.topbar.classList.add('cr-hidden');
    this.startScreen.classList.add('cr-hidden');
    this.overScreen.classList.add('cr-hidden');
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
      const lives = Math.max(0, gs.lives);
      const empty = Math.max(0, GAME.LIVES - lives);
      this.livesEl.innerHTML =
        `<img class="cr-heart" src="${HEART_FULL}" alt="">`.repeat(lives) +
        `<img class="cr-heart cr-heart--empty" src="${HEART_EMPTY}" alt="">`.repeat(empty);
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
