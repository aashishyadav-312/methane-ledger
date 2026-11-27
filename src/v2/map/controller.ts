/*
 * The imperative zoom engine behind <MineMapV2>: d3-zoom on the map surface, fly-to (Appendix F), and the one
 * write per zoom frame. Framework-free so React never re-renders on a zoom or a scroll frame.
 */
import { select, type Selection } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, zoomTransform, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom';
import type { MapTransform } from '../contracts';
import {
  centredAt,
  constrainTransform,
  dotScale,
  fitTransform,
  flyAnchor,
  flyPath,
  NO_INSETS,
  panExtent,
  type Extent,
  type Insets,
  type Size,
  type ViewBox,
} from './geometry';
import { DBLCLICK_ZOOM_MS, FLY, HOLLOW_MIN_ZOOM, REDUCED_CROSSFADE_MS, ZOOM_EXTENT } from './motion';

export type WheelMode = 'zoom' | 'modifier';

export interface ControllerOptions {
  surface: HTMLDivElement;
  layers: SVGGElement[];
  /** The overlay layer: it carries the `is-deep` class (zoom ≥ 4). */
  overlay: SVGGElement;
  /** The dots layer: it carries `--dot-scale` and is crossfaded on a reduced-motion jump. */
  dots: SVGGElement;
  /** The few elements whose text keeps its screen size: they carry `--inv-k` (1 / k). */
  textLayers: SVGGElement[];
  viewBox: ViewBox;
  onSettle(): void;
}

type Zoom = ZoomBehavior<HTMLDivElement, unknown>;

const toD3 = (t: MapTransform) => zoomIdentity.translate(t.x, t.y).scale(t.k);
const plain = (t: { k: number; x: number; y: number }): MapTransform => ({ k: t.k, x: t.x, y: t.y });

export class MapController {
  private readonly opts: ControllerOptions;
  private readonly sel: Selection<HTMLDivElement, unknown, null, undefined>;
  private readonly zoom: Zoom;
  private readonly listeners = new Set<(t: MapTransform) => void>();
  private size: Size = { width: 1, height: 1 };
  private insets: Insets = NO_INSETS;
  private fit: MapTransform = { k: 1, x: 0, y: 0 };
  private fly: { raf: number; done: () => void } | null = null;
  private saved: MapTransform | null = null;
  private lastAnchor: [number, number] | null = null;
  private touched = false;
  private deep: boolean | null = null;
  private wheelMode: WheelMode = 'zoom';
  private enabled = true;
  reducedMotion = false;
  freezeSeconds: number | null = null;

  constructor(opts: ControllerOptions) {
    this.opts = opts;
    this.sel = select(opts.surface);
    const extent = panExtent(opts.viewBox);
    this.zoom = d3zoom<HTMLDivElement, unknown>()
      .extent(() => [
        [0, 0],
        [this.size.width, this.size.height],
      ])
      .translateExtent(extent)
      .constrain((t, viewport, te) => {
        const c = constrainTransform(plain(t), viewport as Extent, te as Extent);
        return c.x === t.x && c.y === t.y ? t : toD3(c);
      })
      .filter((event: Event) => {
        if (!this.enabled) return false;
        const e = event as MouseEvent & WheelEvent;
        if (e.type === 'wheel') return this.wheelMode === 'zoom' || e.ctrlKey || e.metaKey;
        return !e.ctrlKey && !e.button;
      })
      .on('start', (e: D3ZoomEvent<HTMLDivElement, unknown>) => {
        if (e.sourceEvent) {
          this.touched = true;
          this.cancelFly();
        }
      })
      .on('zoom', (e: D3ZoomEvent<HTMLDivElement, unknown>) => this.write(plain(e.transform)))
      .on('end', () => {
        if (!this.fly) this.opts.onSettle();
      });
    this.sel.call(this.zoom);
  }

  destroy() {
    this.cancelFly();
    this.sel.on('.zoom', null);
    this.listeners.clear();
  }

  /**
   * The write per frame: one transform string on the land and overlay groups, the dot scale on the dots layer, and
   * 1 / k on the two small text layers. Each variable is set as low in the tree as it can be, since a change to an
   * inherited custom property restyles every element below it.
   */
  private write(t: MapTransform) {
    const attr = `translate(${t.x},${t.y}) scale(${t.k})`;
    for (const g of this.opts.layers) g.setAttribute('transform', attr);
    const z = t.k / this.fit.k;
    this.opts.dots.style.setProperty('--dot-scale', String(dotScale(z)));
    const invK = String(1 / t.k);
    for (const g of this.opts.textLayers) g.style.setProperty('--inv-k', invK);
    const deep = z >= HOLLOW_MIN_ZOOM;
    if (deep !== this.deep) {
      this.deep = deep;
      this.opts.overlay.classList.toggle('is-deep', deep);
    }
    for (const cb of this.listeners) cb(t);
  }

  setWheelMode(mode: WheelMode) {
    this.wheelMode = mode;
  }

  /** Off while the map docks into the mini card. */
  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.cancelFly();
  }

  setReducedMotion(on: boolean) {
    this.reducedMotion = on;
    this.zoom.duration(on ? 0 : DBLCLICK_ZOOM_MS);
  }

  /** Container size and fit insets. The fit view is re-applied until the user or a fly-to moves the map. */
  layout(size: Size, insets: Insets) {
    this.size = size;
    this.insets = insets;
    this.fit = fitTransform(this.opts.viewBox, size, insets);
    this.zoom.scaleExtent([this.fit.k * ZOOM_EXTENT[0], this.fit.k * ZOOM_EXTENT[1]]);
    if (!this.touched && !this.fly && !this.saved) this.set(this.fit);
    else this.write(this.get());
  }

  get(): MapTransform {
    return plain(zoomTransform(this.opts.surface));
  }

  getFit(): MapTransform {
    return this.fit;
  }

  /** Zoom relative to the fitted India view (1 to 24). */
  zoomLevel(): number {
    return this.get().k / this.fit.k;
  }

  onTransform(cb: (t: MapTransform) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private set(t: MapTransform) {
    this.zoom.transform(this.sel, toD3(t));
  }

  private constrained(t: MapTransform): MapTransform {
    const viewport: Extent = [
      [0, 0],
      [this.size.width, this.size.height],
    ];
    return constrainTransform(t, viewport, panExtent(this.opts.viewBox));
  }

  private cancelFly() {
    if (!this.fly) return;
    cancelAnimationFrame(this.fly.raf);
    const { done } = this.fly;
    this.fly = null;
    done();
    this.opts.onSettle();
  }

  private crossfadeDots() {
    const el = this.opts.dots;
    if (typeof el.animate === 'function') {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: REDUCED_CROSSFADE_MS, easing: 'linear' });
    }
  }

  /** Move to a transform along the van Wijk path, or jump (reduced motion), or stop at the frozen time. */
  private animateTo(target: MapTransform, anchor: [number, number]): Promise<void> {
    this.cancelFly();
    this.touched = true;
    this.lastAnchor = anchor;
    if (this.reducedMotion) {
      this.set(target);
      this.crossfadeDots();
      this.opts.onSettle();
      return Promise.resolve();
    }
    const path = flyPath(this.get(), target, anchor, this.size.width);
    if (this.freezeSeconds !== null) {
      this.set(path.at((this.freezeSeconds * 1000) / path.durationMs));
      this.opts.onSettle();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = performance.now();
      const step = (now: number) => {
        if (!this.fly) return;
        const u = Math.min(1, (now - start) / path.durationMs);
        this.set(path.at(u));
        if (u < 1) {
          this.fly.raf = requestAnimationFrame(step);
          return;
        }
        this.fly = null;
        this.opts.onSettle();
        resolve();
      };
      this.fly = { raf: requestAnimationFrame(step), done: resolve };
    });
  }

  /** Appendix F: zoom 6, the point at the centre of the map area left of the panel and above a phone sheet. */
  flyToPoint(x: number, y: number, offsetRight = 0, offsetBottom = 0): Promise<void> {
    this.saved ??= this.get();
    const anchor = flyAnchor(this.size, this.insets.top, offsetRight, offsetBottom);
    const target = this.constrained(centredAt(x, y, this.fit.k * FLY.zoom, anchor));
    return this.animateTo(target, anchor);
  }

  /** Back to the view before the first fly-to of this selection, or to all of India. */
  reset(): Promise<void> {
    const target = this.saved ?? this.fit;
    this.saved = null;
    return this.animateTo(target, this.lastAnchor ?? [this.size.width / 2, this.size.height / 2]);
  }

  /** All of India, along the fly-to path. */
  showAll(): Promise<void> {
    this.saved = null;
    return this.animateTo(this.fit, this.lastAnchor ?? [this.size.width / 2, this.size.height / 2]);
  }

  /** The fit view at once (the 0 key: keyboard actions never animate). */
  showAllNow() {
    this.cancelFly();
    this.saved = null;
    this.set(this.fit);
  }

  /** Zoom about the centre of the visible map area, at once. */
  zoomBy(factor: number) {
    this.cancelFly();
    this.touched = true;
    const cx = (this.insets.left + this.size.width - this.insets.right) / 2;
    const cy = (this.insets.top + this.size.height - this.insets.bottom) / 2;
    this.zoom.scaleBy(this.sel, factor, [cx, cy]);
  }

  /** Pan by screen pixels, at once. */
  panBy(dx: number, dy: number) {
    this.cancelFly();
    this.touched = true;
    const k = this.get().k;
    this.zoom.translateBy(this.sel, dx / k, dy / k);
  }

  getSize(): Size {
    return this.size;
  }
}
