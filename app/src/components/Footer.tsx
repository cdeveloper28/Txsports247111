import { GithubLogo, SoccerBall } from "@phosphor-icons/react";

export function Footer({ wide = false }: { wide?: boolean }) {
  return (
    <footer className="border-t border-border py-10">
      <div className={(wide ? "mx-auto w-full max-w-[1400px] px-4 sm:px-6" : "container") + " flex flex-col items-center justify-between gap-4 sm:flex-row"}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <SoccerBall weight="fill" size={18} className="text-foreground" />
          Txsports. No bookmaker, no oracle, no admin key.
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
