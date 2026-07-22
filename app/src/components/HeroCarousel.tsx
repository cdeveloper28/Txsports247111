import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";

/**
 * Hero product showreel: the real app screens (public/shots) cycling like a story reel.
 * Story-style segmented progress encodes both position and time-to-next; the slide itself uses a
 * restrained slide + crossfade + micro-scale on an ease-out-expo curve. Auto-advances, pauses on
 * hover and when off-screen, honours prefers-reduced-motion, and the frame links into the app.
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
  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 44 : -44, scale: 1.04 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -44 : 44, scale: 1 }),
};

export function HeroCarousel() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [progress, setProgress] = useState(0); // 0..1 through the current slide
  const [hover, setHover] = useState(false);
  const [visible, setVisible] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const progRef = useRef(0);
  const rafRef = useRef<number>();

  const paused = hover || !!reduce || !visible;

  const go = (i: number, d: number) => {
    progRef.current = 0;
    setProgress(0);
    setDir(d);
    setIndex((i + SHOTS.length) % SHOTS.length);
  };

  // Pause the reel while it's scrolled out of view (saves work, and it's not on screen anyway).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Auto-advance: accumulate real elapsed time so the progress bar and the slide stay in lockstep,
  // and freeze cleanly whenever `paused` flips.
  useEffect(() => {
    if (paused) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      progRef.current += dt / INTERVAL;
      if (progRef.current >= 1) {
        progRef.current = 0;
        setDir(1);
        setIndex((p) => (p + 1) % SHOTS.length);
      }
      setProgress(progRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [paused, index]);

  const shot = SHOTS[index];
  const anim: any = reduce
    ? { initial: false }
    : { custom: dir, variants, initial: "enter", animate: "center", exit: "exit", transition: { duration: 0.75, ease: EASE } };

  return (
    <div
      ref={wrapRef}
      className="group relative overflow-hidden rounded-xl border border-border bg-[#0b0c0e] shadow-2xl transition-colors hover:border-primary/40"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* slides - fixed ratio frame (every shot is ~2.06:1, so object-cover crops nothing) */}
      <a href="#/app" aria-label="Open the Txsports app" className="relative block aspect-[1907/930] overflow-hidden">
        <AnimatePresence initial={false} custom={dir}>
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
        {/* scrims so the progress bar + label stay legible over any screenshot */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/45 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
      </a>

      {/* story-style progress segments (siblings of the link, so they don't trigger navigation) */}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1.5 p-3">
        {SHOTS.map((s, i) => (
          <button
            key={s.src}
            type="button"
            aria-label={`Show ${s.label}`}
            onClick={() => go(i, i >= index ? 1 : -1)}
            className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/20 transition-colors hover:bg-white/30"
          >
            <span
              className="block h-full rounded-full bg-white"
              style={{ width: i < index ? "100%" : i === index ? `${progress * 100}%` : "0%" }}
            />
          </button>
        ))}
      </div>

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

      {/* prev / next - desktop, reveal on hover */}
      <button
        type="button"
        aria-label="Previous screen"
        onClick={() => go(index - 1, -1)}
        className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-white/15 bg-black/40 p-2 text-white/90 opacity-0 backdrop-blur-sm transition hover:bg-black/70 group-hover:opacity-100 md:block"
      >
        <ArrowLeft weight="bold" size={16} />
      </button>
      <button
        type="button"
        aria-label="Next screen"
        onClick={() => go(index + 1, 1)}
        className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 rounded-full border border-white/15 bg-black/40 p-2 text-white/90 opacity-0 backdrop-blur-sm transition hover:bg-black/70 group-hover:opacity-100 md:block"
      >
        <ArrowRight weight="bold" size={16} />
      </button>
    </div>
  );
}
