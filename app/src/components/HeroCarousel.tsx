import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Hero product showreel: the real app screens (public/shots) auto-cycling with a restrained
 * slide + crossfade + micro-scale on an ease-out-expo curve. No controls, no progress bar - it just
 * plays. Pauses on hover and when off-screen, honours prefers-reduced-motion, and the frame links
 * into the app.
 */
const SHOTS = [
  { src: "/shots/markets.png", label: "Markets" },
  { src: "/shots/live.png", label: "Live match" },
  { src: "/shots/proof.png", label: "Settlement proof" },
  { src: "/shots/receipt.png", label: "Payout receipt" },
  { src: "/shots/history.png", label: "History" },
  { src: "/shots/sim.png", label: "Simulation" },
];
const INTERVAL = 4200; // ms per slide
const EASE = [0.22, 1, 0.36, 1] as const; // ease-out-expo

const variants = {
  enter: { opacity: 0, x: 44, scale: 1.04 },
  center: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -44, scale: 1 },
};

export function HeroCarousel() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  const paused = hover || !!reduce || !visible;

  // Pause the reel while it's scrolled out of view.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Auto-advance; resets whenever the slide changes or playback pauses/resumes.
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setIndex((p) => (p + 1) % SHOTS.length), INTERVAL);
    return () => clearTimeout(t);
  }, [paused, index]);

  const shot = SHOTS[index];
  const anim: any = reduce
    ? { initial: false }
    : { variants, initial: "enter", animate: "center", exit: "exit", transition: { duration: 0.75, ease: EASE } };

  return (
    <div
      ref={wrapRef}
      className="group relative overflow-hidden rounded-xl border border-border bg-[#0b0c0e] shadow-2xl transition-colors hover:border-primary/40"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* slides - fixed ratio frame (every shot is ~2.06:1, so object-cover crops nothing) */}
      <a href="#/app" aria-label="Open the Txsports app" className="relative block aspect-[1907/930] overflow-hidden">
        <AnimatePresence initial={false}>
          <motion.img
            key={index}
            src={shot.src}
            alt={`Txsports — ${shot.label}`}
            {...anim}
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
            loading="eager"
          />
        </AnimatePresence>
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-white/5" />
        {/* soft scrim so the label stays legible over any screenshot */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
      </a>

      {/* current-view label */}
      <div className="pointer-events-none absolute bottom-0 left-0 z-20 p-3">
        <AnimatePresence mode="wait">
          <motion.span
            key={shot.label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {shot.label}
          </motion.span>
        </AnimatePresence>
      </div>
    </div>
  );
}
