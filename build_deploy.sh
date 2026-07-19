#!/usr/bin/env bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$HOME/.avm/bin:$PATH"
cd /home/cdev28/worldcup-market
set -e
solana config set --url "${ANCHOR_PROVIDER_URL:?set ANCHOR_PROVIDER_URL to your RPC url}" >/dev/null 2>&1
echo "rpc: $(solana config get | grep 'RPC URL')"
echo "=== build .so (v1.52) ==="
cargo-build-sbf --tools-version v1.52 2>&1 | tail -2
echo "=== regen IDL ==="
cargo test -p worldcup-market --features idl-build -- --nocapture --test-threads=1 > idlraw.log 2>&1
python3 merge_idl.py | tail -2
cp target/idl/worldcup_market.json app/src/idl/worldcup_market.json
python3 -c "import json;print('IDL address:', json.load(open('target/idl/worldcup_market.json'))['address'])"
echo "=== deploy ==="
solana program deploy target/deploy/worldcup_market.so --program-id target/deploy/worldcup_market-keypair.json 2>&1 | tail -4
echo "balance after deploy: $(solana balance)"
