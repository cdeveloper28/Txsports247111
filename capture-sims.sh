#!/usr/bin/env bash
# Batch-capture real TxLINE proofs + build replay feeds for a set of past World Cup fixtures
# (the simulation markets). Reads space-separated fixture ids from /tmp/sim-ids.txt.
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
cd "$HOME/worldcup-market"
IDS=$(cat /tmp/sim-ids.txt)
ok=0; fail=0
for ID in $IDS; do
  echo "=== capture $ID ==="
  FIXTURE_ID=$ID bash b.sh npx ts-node scripts/capture-proof.ts 2>&1 | grep -E "proven full|Error|could not|No score" | head -2
  python3 build_feed.py 2>&1 | head -1
  if cp -f "fixtures/$ID.json" "app/public/proof-$ID.json" 2>/dev/null; then echo "  wired $ID"; ok=$((ok+1)); else echo "  SKIP $ID"; fail=$((fail+1)); fi
done
echo "=== done: $ok captured, $fail skipped; total feeds: $(ls -1 app/public/feed-*.json 2>/dev/null | wc -l) ==="
