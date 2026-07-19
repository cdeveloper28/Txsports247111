import Lenis from "lenis";

// Global Lenis smooth scroll. Initialised once from App; `scrollToTop` is used on route changes so
// hash navigation jumps cleanly instead of animating a long scroll. Lenis smooths the real window
// scroll, so position:sticky (bet panel / rails) keeps working.
let lenis: Lenis | null = null;

export function initSmoothScroll() {
  if (lenis || typeof window === "undefined") return;
  lenis = new Lenis({ lerp: 0.11, smoothWheel: true, wheelMultiplier: 1 });
  const loop = (t: number) => { lenis?.raf(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
}

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true });
  else window.scrollTo(0, 0);
}
