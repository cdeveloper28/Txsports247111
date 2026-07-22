const guarantees = [
  {
    title: "Zero house edge",
    body: "Parimutuel pools - winners split the entire pool pro-rata. No bookmaker cut, no margin.",
  },
  {
    title: "Permissionless settlement",
    body: "Any wallet - a keeper bot, a bettor, a stranger - can settle. No admin key, no void instruction.",
  },
  {
    title: "Verifiable receipt",
    body: "Every settlement links the exact Merkle proof and on-chain root it was decided by.",
  },
  {
    title: "Native SOL only",
    body: "Stakes escrow in the market PDA and pay out the instant a valid proof lands. No token to hold.",
  },
  {
    title: "Fixtures",
    body: "Markets across the whole tournament, priced off TxLINE StablePrice consensus odds.",
  },
];

export function Proof() {
  return (
    <section className="border-y border-border bg-card/60 py-12">
      <div className="container grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
        <div>
          <h2 className="text-balance font-display text-3xl font-bold sm:text-4xl">
            Everything a bettor doesn't have to trust.
          </h2>
          <p className="mt-4 max-w-lg text-pretty leading-relaxed text-muted-foreground">
            Every on-chain prediction market trusts a resolver - a multisig or an optimistic oracle - to
            decide who won. Txsports doesn't. Settlement is a Cross-Program Invocation into TxLINE's{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[13px]">validate_stat_v2</code>,
            which verifies a Merkle proof of the final score against the root TxODDS anchors on-chain. If
            the proof doesn't verify, nothing settles.
          </p>
          <div className="mt-6 rounded-xl border border-border bg-secondary/50 p-4 font-mono text-[12.5px] leading-relaxed text-muted-foreground">
            <span className="text-foreground">resolve</span>(outcome, proof) →<br />
            &nbsp;&nbsp;CPI <span className="text-success">txoracle.validate_stat_v2</span>(proof, home−away{" "}
            {"{>,=,<}"} 0)<br />
            &nbsp;&nbsp;→ true ⟹ market settles · false ⟹ revert
          </div>
        </div>

        <div className="lg:self-center">
          {guarantees.map((g) => (
            <div key={g.title} className="border-b border-border py-4 first:border-t lg:first:border-t-0 lg:first:pt-0 lg:last:border-b-0 lg:last:pb-0">
              <h3 className="font-semibold">{g.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{g.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
