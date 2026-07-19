import { motion } from "framer-motion";
import { ArrowRight } from "@phosphor-icons/react";

/** Framed product screenshot with a slim route bar. Shows the WHOLE capture, scaled to fit -
 *  no cropping, so every detail in the shot stays visible. */
function Shot({
  src,
  alt,
  route,
  badge,
}: {
  src: string;
  alt: string;
  route: string;
  badge?: string;
}) {
  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-[#0b0c0e] shadow-card">
      <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
        <span className="font-mono text-[11px] text-muted-foreground">{route}</span>
        {badge && (
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-primary">{badge}</span>
        )}
      </div>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className="mx-auto block h-auto max-h-[78vh] w-auto max-w-full object-contain"
      />
    </figure>
  );
}

const rows: {
  kicker: string;
  title: string;
  body: string;
  cta: { href: string; label: string };
  shot: React.ComponentProps<typeof Shot>;
  flip?: boolean;
}[] = [
  {
    kicker: "Simulation",
    title: "Replay a finished match, settle it for real.",
    body: "22 past World Cup fixtures re-streamed from real TxLINE data. Stake on the frozen kickoff odds, press play, and watch possession, shots, and cards unfold - then the market settles on-chain with the actual score proof.",
    cta: { href: "#/app", label: "Open a replay" },
    shot: {
      src: "/shots/sim.png",
      alt: "Simulated Portugal vs Croatia market with live pitch visualization and match stats",
      route: "#/app · portugal-v-croatia",
      badge: "Replay",
    },
  },
  {
    kicker: "Real · live",
    title: "Or bet the real thing as it happens.",
    body: "Live markets price off TxLINE StablePrice consensus odds, streamed straight from the feed. Watch implied win probability move minute by minute, back a side, and the pool splits live among winners the moment the score proof lands.",
    cta: { href: "#/app", label: "See live markets" },
    shot: {
      src: "/shots/live.png",
      alt: "Live Spain vs Argentina market with implied win probability chart and prediction panel",
      route: "#/app · spain-v-argentina",
      badge: "Live",
    },
    flip: true,
  },
  {
    kicker: "History",
    title: "Your record, keyed to your wallet.",
    body: "Every position, claim, and payout lives on-chain against your key - open positions, claimable pools, P&L over time, and your pick split. Reconnect from any device and it all comes back. Nothing to export, nothing to lose.",
    cta: { href: "#/history", label: "View history" },
    shot: {
      src: "/shots/history.png",
      alt: "Wallet history with positions, net P&L, and profit over time",
      route: "#/history",
    },
  },
];

export function Showcase() {
  return (
    <section className="container py-12">
      <div className="space-y-14">
        {rows.map((r) => (
          <motion.div
            key={r.kicker}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.5 }}
            className="grid items-center gap-8 lg:grid-cols-[0.38fr_0.62fr] lg:gap-12"
          >
            <div className={r.flip ? "lg:order-2" : ""}>
              <div className="font-mono text-xs font-medium uppercase tracking-[0.22em] text-primary">{r.kicker}</div>
              <h2 className="mt-3 text-balance font-display text-3xl font-bold sm:text-4xl">{r.title}</h2>
              <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">{r.body}</p>
              <a
                href={r.cta.href}
                className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-foreground hover:text-primary"
              >
                {r.cta.label} <ArrowRight weight="bold" size={15} />
              </a>
            </div>
            <div className={r.flip ? "lg:order-1" : ""}>
              <Shot {...r.shot} />
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
