import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BaseWalletMultiButton, useWalletModal } from "@solana/wallet-adapter-react-ui";
import { ArrowRight, ArrowSquareOut, List, Flask, Drop, Wallet, Copy, CheckCircle, SignOut, ArrowsLeftRight } from "@phosphor-icons/react";
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
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-blue-400 transition-colors hover:border-blue-400/70 hover:bg-blue-500/20"
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-lg bg-blue-400 opacity-70" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-lg bg-blue-400" />
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

/** Mobile-only wallet control: one icon button. Outline wallet = disconnected (opens the wallet
 *  picker); filled wallet + green dot = connected (opens address / copy / change / disconnect). */
function MobileWallet() {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const addr = publicKey?.toBase58() ?? "";

  if (!connected) {
    return (
      <button aria-label="Connect wallet" onClick={() => setVisible(true)}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-foreground transition-colors hover:bg-secondary sm:hidden">
        <Wallet weight="bold" size={18} />
      </button>
    );
  }
  const item = "flex w-full items-center gap-2.5 rounded-xl border border-border px-4 py-3 text-sm font-semibold transition-colors hover:bg-secondary";
  return (
    <>
      <button aria-label="Wallet options" onClick={() => setOpen(true)}
        className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-primary/50 bg-primary/10 text-primary transition-colors sm:hidden">
        <Wallet weight="fill" size={18} />
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-success" aria-hidden />
      </button>
      <Modal open={open} onClose={() => { setOpen(false); setCopied(false); }} title="Wallet">
        <div className="rounded-xl border border-border bg-secondary/50 px-4 py-3 text-center font-mono text-sm">
          {addr.slice(0, 6)}…{addr.slice(-6)}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button className={item} onClick={async () => { try { await navigator.clipboard.writeText(addr); setCopied(true); } catch { /* clipboard denied */ } }}>
            {copied ? <CheckCircle weight="fill" size={16} className="text-success" /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy address"}
          </button>
          <button className={item} onClick={() => { setOpen(false); setVisible(true); }}>
            <ArrowsLeftRight size={16} /> Change wallet
          </button>
          <button className={item + " text-danger"} onClick={async () => { setOpen(false); try { await disconnect(); } catch { /* already gone */ } }}>
            <SignOut size={16} /> Disconnect
          </button>
        </div>
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
        <div className="ml-3 flex items-center gap-2 sm:gap-5">
          <DevnetTag />
          {page === "landing" ? (
            <>
              {/* Marketing nav: no app links, no wallet on desktop - the funnel is "Predict now" */}
              <a href="#how" className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:block">How it works</a>
              <Button size="sm" asChild className="hidden sm:inline-flex">
                <a href="#/app">Predict now <ArrowRight weight="bold" size={15} /></a>
              </Button>
            </>
          ) : (
            <>
              <NavLink href="#/app" active={page === "market"}>Markets</NavLink>
              <NavLink href="#/history" active={page === "history"}>History</NavLink>
              <div className="hidden sm:block"><BaseWalletMultiButton labels={WALLET_LABELS} /></div>
            </>
          )}
          <MobileWallet />
          <MobileMenu page={page} />
        </div>
      </div>
    </header>
  );
}
