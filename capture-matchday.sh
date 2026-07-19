#!/usr/bin/env bash
# Capture real TxLINE proofs + build per-fixture replay feeds for the simulated matchday fixtures.
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
cd "$HOME/worldcup-market"
for ID in 18222446 18237038; do
  echo "=== capture $ID ==="
  FIXTURE_ID=$ID bash b.sh npx ts-node scripts/capture-proof.ts 2>&1 | grep -E "proven|fetching proof|saved proof|Error|could not|No score"
  python3 build_feed.py 2>&1 | head -1
  if cp -f "fixtures/$ID.json" "app/public/proof-$ID.json"; then echo "wired proof-$ID.json"; else echo "SKIP $ID"; fi
done
echo "=== files ==="
ls -1 app/public/feed-*.json app/public/proof-*.json
