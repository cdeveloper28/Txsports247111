import { GithubLogo, SoccerBall } from "@phosphor-icons/react";
import ReactiveLines from "./ReactiveLines";

export function Footer({ wide = false }: { wide?: boolean }) {
  return (
    <footer className="relative overflow-hidden border-t border-border">
      {/* OriginKit reactive-lines curtain - same phantom black + blue accent as the hero */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <ReactiveLines
          backgroundColor="rgb(13, 14, 16)"
          lineColor="rgba(99, 142, 255, 0.42)"
          lineWidth={1}
          minLines={10}
          maxLines={44}
          fade
          fadeIntensity={24}
        />
        {/* blend the curtain into the page above + keep the footer copy legible */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
      </div>

      <div className={(wide ? "mx-auto w-full max-w-[1400px] px-4 sm:px-6" : "container") + " relative z-10 flex flex-col items-center justify-between gap-4 py-14 sm:flex-row"}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SoccerBall weight="fill" size={18} className="text-foreground" />
          Txsports. No bookmaker, no oracle, no house control.
        </div>
        <div className="flex items-center gap-5 text-sm text-muted-foreground">
          <a className="hover:text-foreground" href="#/developers">Developers</a>
          <a className="inline-flex items-center gap-1.5 hover:text-foreground" href="https://github.com/cdeveloper28/Txsports247111" target="_blank" rel="noreferrer">
            <GithubLogo weight="fill" size={16} /> Repo
          </a>
          <a className="hover:text-foreground" href="https://txline.txodds.com" target="_blank" rel="noreferrer">TxLINE</a>
        </div>
      </div>
    </footer>
  );
}
