/*
 * Scroll docking (PLAN_V2 Appendix E), framework-free: style writes on the map's outer wrapper only, so a scroll frame
 * never re-renders React. The caller feeds the (spring-smoothed) progress p in 0..1.
 */
import { dockedScale, dockFrame, nextDocked, type DockRest } from './geometry';
import { DOCK } from './motion';

export interface DockElements {
  /** Never transformed: its box is the wrapper's rest position. */
  anchor: HTMLElement;
  /** The wrapper that scales and travels. */
  dock: HTMLElement;
  /** Inner clip whose corner radius grows. */
  clip: HTMLElement;
  /** The card's border and shadow, faded in at the end. */
  chrome: HTMLElement;
  /** Floating controls: they fade out as the map leaves. */
  controls: HTMLElement | null;
}

export interface DockCallbacks {
  /** p > 0: the map is leaving, so its gestures are off. */
  onActive(active: boolean): void;
  /** p ≥ 0.98 (hysteresis to 0.95): fixed in place, a link back to the map. */
  onDocked(docked: boolean): void;
}

const restOf = (el: HTMLElement): DockRest => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};

export class Dock {
  private readonly els: DockElements;
  private readonly cb: DockCallbacks;
  private p = 0;
  private active = false;
  private docked = false;
  private pinned: DockRest | null = null;
  private reducedSide: 'full' | 'mini' = 'full';
  private chromeFor = '';
  reducedMotion = false;

  constructor(els: DockElements, cb: DockCallbacks) {
    this.els = els;
    this.cb = cb;
  }

  /** Re-apply after a resize. */
  refresh() {
    this.pinned = null;
    if (this.docked) this.pin(restOf(this.els.anchor));
    this.set(this.p, true);
  }

  private pin(rest: DockRest) {
    this.pinned = rest;
    const s = this.els.dock.style;
    s.position = 'fixed';
    s.left = `${rest.left}px`;
    s.top = `${rest.top}px`;
    s.width = `${rest.width}px`;
    s.height = `${rest.height}px`;
    s.right = 'auto';
    s.bottom = 'auto';
  }

  private unpin() {
    this.pinned = null;
    const s = this.els.dock.style;
    for (const k of ['position', 'left', 'top', 'width', 'height', 'right', 'bottom'] as const) s[k] = '';
  }

  /** The card's border and shadow at the final scale, so they read as 1px and the V2-Results shadow on screen. */
  private sizeChrome(rest: DockRest, vw: number) {
    const sF = dockedScale(rest.width, vw);
    const key = `${sF}`;
    if (key === this.chromeFor) return;
    this.chromeFor = key;
    const s = this.els.chrome.style;
    s.borderWidth = `${DOCK.borderPx / sF}px`;
    s.borderRadius = `${DOCK.radiusPx / sF}px`;
    s.boxShadow = `0 ${DOCK.shadow.y / sF}px ${DOCK.shadow.blur / sF}px rgba(26, 25, 22, ${DOCK.shadow.alpha})`;
    this.els.dock.style.setProperty('--dock-inv-s', String(1 / sF));
  }

  set(pIn: number, force = false) {
    const p = Math.min(1, Math.max(0, Number.isFinite(pIn) ? pIn : 0));
    if (p === this.p && !force) return;
    this.p = p;

    // Reads first, then writes.
    const vw = document.documentElement.clientWidth;
    const wasDocked = this.docked;
    const docked = nextDocked(wasDocked, p);
    const rest = this.pinned ?? restOf(this.els.anchor);

    const active = p > 0;
    if (active !== this.active) {
      this.active = active;
      this.els.dock.style.willChange = active ? 'transform' : '';
      this.cb.onActive(active);
    }
    if (docked !== wasDocked) {
      this.docked = docked;
      if (docked) this.pin(rest);
      else this.unpin();
      this.cb.onDocked(docked);
    }

    this.sizeChrome(rest, vw);
    let shown = p;
    if (this.reducedMotion) {
      // No transform travel: the full map fades out and the mini card fades in, at p = 0.5.
      const side = p >= DOCK.reducedSwitchAt ? 'mini' : 'full';
      shown = side === 'mini' ? 1 : 0;
      if (side !== this.reducedSide) {
        this.reducedSide = side;
        if (typeof this.els.dock.animate === 'function') {
          this.els.dock.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DOCK.reducedFadeMs, easing: 'linear' });
        }
      }
    }
    const f = dockFrame(shown, rest, vw);
    const d = this.els.dock.style;
    d.transform = shown > 0 ? `translate(${f.tx}px, ${f.ty}px) scale(${f.scale})` : '';
    this.els.clip.style.borderRadius = f.clipRadius > 0 ? `${f.clipRadius}px` : '';
    this.els.chrome.style.opacity = String(f.chrome);
    if (this.els.controls) {
      this.els.controls.style.opacity = String(1 - f.eased);
      this.els.controls.style.visibility = f.eased >= 1 ? 'hidden' : '';
    }
  }

  get progress() {
    return this.p;
  }
}
