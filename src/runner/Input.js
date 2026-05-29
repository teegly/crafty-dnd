// Keyboard + touch-swipe input, normalised to discrete game actions:
//   'left' | 'right' | 'jump' | 'slide'
//
// Only listens while enabled (during a run), so it never interferes with the
// passive AMBIENT mode. The caller decides what an action means — a left/right may
// be reinterpreted as a junction turn when one is armed (Phase 5).

const KEY_ACTIONS = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  ArrowDown: 'slide',
  KeyS: 'slide',
};

const SWIPE_MIN = 28; // px before a touch drag counts as a swipe (vs a tap)

export class Input {
  constructor(onAction) {
    this.onAction = onAction;
    this.enabled = false;
    this._touch = null;
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
  }

  enable() {
    if (this.enabled) return;
    this.enabled = true;
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('touchstart', this._onTouchStart, { passive: false });
    window.addEventListener('touchend', this._onTouchEnd, { passive: false });
  }

  disable() {
    if (!this.enabled) return;
    this.enabled = false;
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('touchstart', this._onTouchStart);
    window.removeEventListener('touchend', this._onTouchEnd);
    this._touch = null;
  }

  _onKeyDown(e) {
    const action = KEY_ACTIONS[e.code];
    if (!action) return;
    e.preventDefault(); // stop arrows/space from scrolling the page
    this.onAction(action);
  }

  _onTouchStart(e) {
    const t = e.changedTouches[0];
    this._touch = { x: t.clientX, y: t.clientY };
  }

  _onTouchEnd(e) {
    if (!this._touch) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - this._touch.x;
    const dy = t.clientY - this._touch.y;
    this._touch = null;
    if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) return; // tap: ignore
    if (Math.abs(dx) > Math.abs(dy)) this.onAction(dx > 0 ? 'right' : 'left');
    else this.onAction(dy > 0 ? 'slide' : 'jump');
  }
}
