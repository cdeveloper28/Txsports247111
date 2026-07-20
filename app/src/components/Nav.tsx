import { useState } from "react";
import { BaseWalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { ArrowRight, ArrowSquareOut, List, Flask, Drop } from "@phosphor-icons/react";
import { Drawer } from "vaul";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";

type Page = "landing" | "market" | "history";

// Short labels so the trigger fits a phone nav ("Select Wallet" overflows it).
const WALLET_LABELS = {
  "change-wallet": "Change wallet",
  connecting: "Connecting…",
  "copy-address": "Copy address",
  copied: "Copied",
  disconnect: "Disconnect",
  "has-wallet": "Connect",
  "no-wallet": "Wallet",
} as const;

const FAUCET_URL = "https://j.tools/en/tools/devnet-faucet";

/** Amber "Devnet mode" pill; opens a modal explaining the network + a faucet link. */
function DevnetTag() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-400 transition-colors hover:border-amber-400/70 hover:bg-amber-500/20"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
        </span>
        <span className="hidden sm:inline">Devnet mode</span>
        <span className="sm:hidden">Devnet</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)}
        title={<span className="inline-flex items-center gap-2"><Flask weight="fill" size={20} className="text-amber-400" /> You're on Solana Devnet</span>}>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Txsports runs on <b className="text-foreground">Solana Devnet</b>: every market, bet, and payout is a
          real on-chain transaction, but the SOL is test currency with no monetary value. Grab free devnet SOL
          from the faucet, connect your wallet (set to Devnet), and play with the full product risk-free.
        </p>
        <a
          href={FAUCET_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-display text-sm font-bold text-primary-foreground transition hover:brightness-110"
        >
          <Drop weight="fill" size={16} /> Get test tokens <ArrowSquareOut weight="bold" size={14} />
        </a>
      </Modal>
    </>
  );
}

function NavLink({ href, active, children }: { href: string; active?: boolean; children: React.ReactNode }) {
  return (
    <a href={href} className={"hidden text-sm font-medium sm:block " + (active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </a>
  );
}

/** Mobile-only hamburger that opens a bottom drawer with the nav links (desktop shows them inline). */
function MobileMenu({ page }: { page: Page }) {
  // Landing is a clean marketing page: only "How it works" - app links live behind "Predict now".
  const links = page === "landing"
    ? [{ href: "#how", label: "How it works" }, { href: "#/app", label: "Predict now" }]
    : [
        { href: "#/app", label: "Markets" },
        { href: "#/history", label: "History" },
      ];
  return (
    <Drawer.Root>
      <Drawer.Trigger asChild>
        <button aria-label="Open menu" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-foreground transition-colors hover:bg-secondary sm:hidden">
          <List weight="bold" size={18} />
        </button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-[90] rounded-t-2xl border-t border-border bg-card p-5 pb-8 outline-none">
          <div className="mx-auto mb-5 h-1.5 w-10 rounded-full bg-secondary" />
          <Drawer.Title className="sr-only">Navigation</Drawer.Title>
          <Drawer.Description className="sr-only">Jump to a section of Txsports</Drawer.Description>
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <Drawer.Close asChild key={l.href}>
                <a href={l.href} className="flex items-center justify-between rounded-xl px-4 py-3 text-base font-semibold transition-colors hover:bg-secondary">
                  {l.label} <ArrowRight weight="bold" size={16} className="text-muted-foreground" />
                </a>
              </Drawer.Close>
            ))}
          </nav>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function Nav({ page = "landing", wide = false }: { page?: Page; wide?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 glass">
      <div className={(wide ? "mx-auto w-full max-w-[1400px] px-4 sm:px-6" : "container") + " flex h-16 items-center justify-between"}>
        <a href="#/" className="flex items-center gap-2.5">
          <img src="/Txsports.png" alt="Txsports" className="h-9 w-9 shrink-0 object-contain" />
          <div className="leading-tight">
            <div className="font-display text-[17px] font-bold">
              Tx<span className="text-primary">sports</span>
            </div>
           
          </div>
        </a>
        <div className="ml-3 flex items-center gap-3 sm:gap-5">
          <DevnetTag />
          {page === "landing" ? (
            <>
              {/* Marketing nav: no app links, no wallet - the funnel is "Predict now" */}
              <a href="#how" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block">How it works</a>
              <Button size="sm" asChild className="hidden sm:inline-flex">
                <a href="#/app">Predict now <ArrowRight weight="bold" size={15} /></a>
              </Button>
            </>
          ) : (
            <>
              <NavLink href="#/app" active={page === "market"}>Markets</NavLink>
              <NavLink href="#/history" active={page === "history"}>History</NavLink>
              <BaseWalletMultiButton labels={WALLET_LABELS} />
            </>
          )}
          <MobileMenu page={page} />
        </div>
      </div>
    </header>
  );
}
