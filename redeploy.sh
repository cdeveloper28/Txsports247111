#!/usr/bin/env bash
# Rebuild + redeploy the program (new id, with cancel_bet) and regenerate the IDL.
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
cd "$HOME/worldcup-market"
cp -f /tmp/wcm-cancel-keypair.json target/deploy/worldcup_market-keypair.json
echo "deploy id: $(solana address -k target/deploy/worldcup_market-keypair.json)"
echo "=== build (v1.52) ==="
cargo-build-sbf --tools-version v1.52 2>&1 | tail -3
echo "=== close old KGXYL (reclaim SOL) ==="
solana program close KGXYL4J3pSLfpmVNpo24FkypHE8zorFoYXWAWkk4CSU --bypass-warning 2>&1 | tail -3
echo "balance: $(solana balance)"
echo "=== deploy new id ==="
solana program deploy target/deploy/worldcup_market.so --program-id target/deploy/worldcup_market-keypair.json 2>&1 | tail -4
echo "=== regen IDL ==="
cargo test -p worldcup-market --features idl-build -- --nocapture --test-threads=1 > idlraw.log 2>&1
python3 merge_idl.py | tail -2
cp target/idl/worldcup_market.json app/src/idl/worldcup_market.json
python3 -c "import json;d=json.load(open('target/idl/worldcup_market.json'));print('IDL addr:',d['address']);print('ix:',[i['name'] for i in d['instructions']])"
echo "balance after: $(solana balance)"
