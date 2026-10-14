/**
 * The interface is drawn in "UI pixels" with a 12 px pixel font. It is scaled
 * as a whole so that, where the screen allows, one font pixel lands on a
 * whole number of device pixels (crisp glyphs): 2× or 3× on large and
 * high-density screens; 1.5× on a 1080p monitor, the one compromise, so the
 * layout still sees roughly a 1280 × 720 screen.
 */
export function uiZoom(width = window.innerWidth, height = window.innerHeight, dpr = window.devicePixelRatio || 1): number {
  const fit = Math.min((width * dpr) / 1280, (height * dpr) / 720);
  const devicePerUiPixel = fit >= 3 ? 3 : fit >= 2 ? 2 : fit >= 1.45 ? 1.5 : 1;
  return devicePerUiPixel / dpr;
}

/** Apply the zoom to the UI layer and publish its logical size for CSS (viewport units ignore zoom). */
export function applyUiScale(root: HTMLElement): void {
  const z = uiZoom();
  root.style.setProperty('zoom', String(z));
  root.style.setProperty('--vw', `${window.innerWidth / z}px`);
  root.style.setProperty('--vh', `${window.innerHeight / z}px`);
  root.dataset.zoom = String(z);
}
