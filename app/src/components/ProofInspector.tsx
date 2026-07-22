import { useEffect, useState } from "react";
import { Modal } from "./ui/modal";
import { TreeStructure, ArrowSquareOut, SealCheck, ArrowDown } from "@phosphor-icons/react";
import { decodeStatKey } from "../lib/gamePhase";

const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" } as const;
const WIN = "#2fbf7f", SIB = "#5b86ff";

interface ProofNode { hash: number[]; isRightSibling: boolean }
interface Stat { stat: { key: number; value: number; period: number }; statProof: ProofNode[] }
export interface Proof {
  fixtureId: number; home: number; away: number; label: string; outcome: number;
  dailyScoresPda: string;
  payload: {
    fixtureSummary?: { fixtureId?: string; updateStats?: { updateCount?: number } };
    fixtureProof?: ProofNode[]; mainTreeProof?: ProofNode[]; stats?: Stat[];
  };
}

/** First 4 + last 4 bytes of a 32-byte hash as hex, e.g. bcd6d4b5…af0e4082. */
const hex = (h: number[]) => {
  const b = (n: number) => n.toString(16).padStart(2, "0");
  return h.slice(0, 4).map(b).join("") + "…" + h.slice(-4).map(b).join("");
};

function HashPill({ node, label }: { node: ProofNode; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SIB }} />
        <span className="min-w-0 truncate text-[11px] font-medium text-muted-foreground">{label}</span>
        <span className="ml-auto shrink-0 rounded bg-background/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {node.isRightSibling ? "right" : "left"}
        </span>
      </div>
      <div className="mt-1 pl-4 text-[11px] text-foreground" style={mono}>{hex(node.hash)}</div>
    </div>
  );
}

/**
 * Walks the actual Merkle proof that settled a market: the finalised score becomes a leaf, sibling
 * hashes fold it up the tree, and the result must equal the daily-scores root TxODDS anchored
 * on-chain. This is the exact path `resolve()` verifies via CPI to txoracle.validate_stat_v2.
 */
export function ProofInspector({ proof, onClose }: { proof: Proof; onClose: () => void }) {
  const stat = proof.payload.stats?.[0]?.stat;
  const decoded = stat ? decodeStatKey(stat.key) : null;
  // Every sibling hash on the path, leaf → root order (stat proof, then main tree, then fixture).
  const siblings: { node: ProofNode; label: string }[] = [
    ...(proof.payload.stats?.[0]?.statProof ?? []).map((n, i) => ({ node: n, label: `Stat sibling ${i + 1}` })),
    ...(proof.payload.mainTreeProof ?? []).map((n, i) => ({ node: n, label: `Main-tree sibling ${i + 1}` })),
    ...(proof.payload.fixtureProof ?? []).map((n, i) => ({ node: n, label: `Fixture sibling ${i + 1}` })),
  ];

  const Arrow = () => (
    <div className="flex justify-center py-1"><ArrowDown size={14} className="text-muted-foreground/60" /></div>
  );

  return (
    <Modal open onClose={onClose} size="2xl"
      title={<span className="inline-flex items-center gap-2"><TreeStructure weight="fill" size={20} className="text-success" /> Proof inspector</span>}>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The winning outcome wasn't decided by us. It was <b className="text-foreground">proven</b>: the real
        full-time score hashes up this exact path to the root TxODDS anchored on Solana.
      </p>

      <div className="mt-4 space-y-1">
        {/* leaf: the finalised score */}
        <div className="rounded-xl border-2 px-4 py-3" style={{ borderColor: WIN, background: "rgba(47,191,127,0.06)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: WIN }}>Score leaf</span>
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-bold text-success">{proof.label}</span>
          </div>
          <div className="tnum mt-1 font-display text-2xl font-bold">{proof.home} : {proof.away}</div>
          {stat && decoded && (
            <div className="mt-1 text-[11px] text-muted-foreground" style={mono}>
              key {stat.key} · {decoded.name} · period {stat.period === 100 ? "full time" : decoded.period} · value {stat.value}
            </div>
          )}
        </div>

        <Arrow />

        {/* the sibling hashes that fold the leaf up */}
        <div className="rounded-xl border border-border bg-card p-2">
          <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {siblings.length} sibling hash{siblings.length === 1 ? "" : "es"} on the path
          </div>
          {/* one per row on mobile, two per row on desktop */}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {siblings.map((s, i) => <HashPill key={i} node={s.node} label={s.label} />)}
          </div>
        </div>

        <Arrow />

        {/* root: anchored on-chain */}
        <div className="rounded-xl border-2 px-4 py-3" style={{ borderColor: WIN, background: "rgba(47,191,127,0.06)" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: WIN }}>
              <SealCheck weight="fill" size={12} /> Daily-scores root
            </span>
            <span className="text-[10px] text-muted-foreground">anchored on-chain</span>
          </div>
          <div className="mt-1 break-all text-[11px] text-foreground" style={mono}>{proof.dailyScoresPda}</div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
        <SealCheck weight="fill" size={13} className="shrink-0 text-success" />
        <span>
          <code className="text-foreground">resolve()</code> recomputes this hash on-chain via CPI to
          <code className="text-foreground"> txoracle.validate_stat_v2</code> and pays out only if it equals the root.
        </span>
      </div>

      <a
        href={`https://explorer.solana.com/address/${proof.dailyScoresPda}?cluster=devnet`}
        target="_blank" rel="noreferrer"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-display text-sm font-bold text-primary-foreground transition hover:brightness-110"
      >
        View root account on Explorer <ArrowSquareOut weight="bold" size={14} />
      </a>
    </Modal>
  );
}

/** Fetches /proof-<fixtureId>.json on demand, then renders the inspector — for surfaces (marquee
 *  receipt, history) that don't already hold the proof in memory. */
export function LazyProofInspector({ fixtureId, onClose }: { fixtureId: number; onClose: () => void }) {
  const [proof, setProof] = useState<Proof | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  useEffect(() => {
    let alive = true;
    fetch(`/proof-${fixtureId}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => { if (!alive) return; if (p) { setProof(p); setState("ready"); } else setState("missing"); })
      .catch(() => { if (alive) setState("missing"); });
    return () => { alive = false; };
  }, [fixtureId]);

  if (state === "ready" && proof) return <ProofInspector proof={proof} onClose={onClose} />;
  return (
    <Modal open onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><TreeStructure weight="fill" size={20} className="text-success" /> Proof inspector</span>}>
      <div className="py-10 text-center text-sm text-muted-foreground">
        {state === "loading" ? "Loading proof…" : "No published proof for this fixture yet — it appears once the result is anchored on-chain."}
      </div>
    </Modal>
  );
}
