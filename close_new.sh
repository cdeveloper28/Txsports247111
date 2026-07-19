#!/usr/bin/env bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
cd /home/cdev28/worldcup-market
echo "balance before: $(solana balance)"
echo "closing old program DKGZ..."
solana program close DKGZJrsZEhz4msP1WSenyv7isvrkbQLF4hf6wUDmaGrF --bypass-warning 2>&1 | tail -4
echo "balance after close: $(solana balance)"
solana-keygen new --no-bip39-passphrase -o target/deploy/worldcup_market-keypair.json --force >/dev/null 2>&1
echo "NEWID=$(solana address -k target/deploy/worldcup_market-keypair.json)"
