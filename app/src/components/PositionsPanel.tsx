import { useEffect, useMemo, useState } from "react";
import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Wallet, HandCoins, Spinner, Clock, Trophy, XCircle, CheckCircle } from "@phosphor-icons/react";
import { IDL, positionPdaFor } from "../config";
import { useOpenPositions, type OpenPosition } from "../lib/onchainMarkets";
import { recordPrediction } from "../lib/history";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Flag } from "./Flag";
import { toast } from "../lib/toast";

const OUTCOME_LABELS = ["Home", "Draw", "Away"];
type FixMap = Record<number, { home: string; away: string }>;

/**
 * Wallet portfolio: every position the connected wallet holds on-chain, joined to its market so we
 * can show what's still open, what's won and is waiting to be claimed, and settle them all in one go.
 */
export function PositionsPanel({ onClaimed }: { onClaimed?: () => void }) {
  const { publicKey } = useWallet();
  const wallet = useAnchorWallet();
  const { connection } = useConnection();
  const { positions, loading, reload } = useOpenPositions(publicKey ?? null);
  const [fix, setFix] = useState<FixMap>({});
  const [busy, setBusy] = useState<string | null>(null); // market pk being claimed, or "all"

  useEffect(() => {
    fetch("/fixtures.json").then((r) => r.json()).then((arr: any[]) => {
      const m: FixMap = {};
      for (const f of arr) m[f.fixtureId] = { home: f.home, away: f.away };
      setFix(m);
    }).catch(() => {});
  }, []);

  const program = useMemo(
    () => (wallet ? new Program(IDL, new AnchorProvider(connection, wallet, { commitment: "confirmed" })) : null),
    [connection, wallet],
  );

  const claimable = positions.filter((p) => p.status === "claimable");
  const open = positions.filter((p) => p.status === "open");
  const totalClaimable = claimable.reduce((s, p) => s + p.payout, 0);
  const openStaked = open.reduce((s, p) => s + p.staked, 0);

  const claimOne = async (p: OpenPosition) => {
    if (!program || !publicKey) throw new Error("Wallet not connected");
    const market = new PublicKey(p.market);
    const sig = await program.methods.claim()
      .accounts({ market, position: positionPdaFor(market, publicKey), owner: publicKey })
      .rpc();
    await recordPrediction({
      wallet: publicKey.toBase58(), market: p.market, fixtureId: p.fixtureId,
      sig, kind: "claim", outcome: p.winningOutcome, amount: p.payout,
    });
  };

  const runClaim = async (p: OpenPosition) => {
    setBusy(p.market);
    try {
      await claimOne(p);
      toast.success(`Claimed ${p.payout.toFixed(3)} SOL`, fix[p.fixtureId] ? `${fix[p.fixtureId].home} v ${fix[p.fixtureId].away}` : undefined);
    } catch (e: any) {
      toast.error("Claim failed", String(e?.message ?? e).slice(0, 80));
    }
    setBusy(null);
    reload();
    onClaimed?.();
  };

  const claimAll = async () => {
    if (!claimable.length) return;
    setBusy("all");
    let ok = 0, sol = 0;
    for (const p of claimable) {
      try { await claimOne(p); ok++; sol += p.payout; } catch (e) { console.error(e); }
    }
    setBusy(null);
    if (ok) toast.success(`Claimed ${sol.toFixed(3)} SOL`, `from ${ok} market${ok > 1 ? "s" : ""}`);
    else toast.error("Nothing claimed", "the transactions were rejected");
    reload();
    onClaimed?.();
  };

  if (!publicKey || (!loading && positions.length === 0)) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Wallet weight="fill" size={15} /> Your positions
        </div>
        {claimable.length > 0 && (
          <Button size="sm" variant="success" onClick={claimAll} disabled={!!busy} className="gap-1.5">
            {busy === "all" ? <Spinner className="animate-spin" size={15} /> : <HandCoins weight="fill" size={15} />}
            Claim all · {totalClaimable.toFixed(3)} SOL
          </Button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Tile label="Open" value={String(open.length)} sub={`${openStaked.toFixed(2)} SOL live`} />
        <Tile label="Claimable" value={String(claimable.length)} sub={`${totalClaimable.toFixed(2)} SOL`} accent={claimable.length > 0} />
        <Tile label="All-time" value={String(positions.length)} sub="positions" />
      </div>

      <div className="mt-4 space-y-2">
        {positions.map((p) => {
          const teams = fix[p.fixtureId];
          const backed = p.amounts.map((a, i) => (a > 0 ? i : -1)).filter((i) => i >= 0);
          return (
            <div key={p.market} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                {teams && (
                  <span className="flex shrink-0 items-center gap-1">
                    <Flag team={teams.home} /><span className="text-[10px] text-muted-foreground">v</span><Flag team={teams.away} />
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{teams ? `${teams.home} v ${teams.away}` : `Market #${p.fixtureId}`}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {backed.map((i) => `${p.amounts[i].toFixed(2)} SOL · ${OUTCOME_LABELS[i]}`).join("  ·  ")}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusPill p={p} />
                {p.status === "claimable" && (
                  <Button size="sm" onClick={() => runClaim(p)} disabled={!!busy} className="h-8 gap-1 px-2.5 text-xs">
                    {busy === p.market ? <Spinner className="animate-spin" size={13} /> : <HandCoins weight="fill" size={13} />}
                    {p.payout.toFixed(3)}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub: string; accent?: boolean }) {
  return (
    <div className={"rounded-xl border p-3 " + (accent ? "border-success/30 bg-success/[0.06]" : "border-border bg-secondary/30")}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={"tnum font-display text-xl font-bold " + (accent ? "text-success" : "")}>{value}</div>
      <div className="tnum text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function StatusPill({ p }: { p: OpenPosition }) {
  const map = {
    open: { icon: Clock, cls: "bg-primary/12 text-primary", text: "Live" },
    claimable: { icon: Trophy, cls: "bg-success/15 text-success", text: p.void ? "Refund" : "Won" },
    lost: { icon: XCircle, cls: "bg-muted text-muted-foreground", text: "Lost" },
    claimed: { icon: CheckCircle, cls: "bg-muted text-muted-foreground", text: "Claimed" },
  }[p.status];
  const Icon = map.icon;
  return (
    <span className={"inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold " + map.cls}>
      <Icon weight="fill" size={12} /> {map.text}
    </span>
  );
}
