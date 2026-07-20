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

/** Glide to an element. Native scrollIntoView jumps while Lenis owns the scroll, so route
 *  through Lenis for the animated transition; `offset` keeps it clear of the sticky nav. */
export function scrollToEl(el: HTMLElement | null, offset = -96) {
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset, duration: 1.1 });
  else el.scrollIntoView({ behavior: "smooth", block: "center" });
}
