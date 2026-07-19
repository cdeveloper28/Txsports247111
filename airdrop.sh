#!/usr/bin/env bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana config set --url https://api.devnet.solana.com >/dev/null 2>&1
for i in $(seq 1 12); do
  echo "attempt $i ($(date +%H:%M:%S)):"
  if solana airdrop 2 2>&1 | tail -1; then
    bal=$(solana balance)
    echo "  balance=$bal"
    case "$bal" in 0*" SOL"|"0 SOL") ;; *) echo "FUNDED: $bal"; break;; esac
  fi
  sleep 15
done
echo "FINAL=$(solana balance)"
