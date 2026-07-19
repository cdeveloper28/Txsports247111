#!/usr/bin/env bash
# Build/run helper: sets tool PATH (solana, anchor, cargo, native node via nvm) + devnet wallet,
# runs from the project dir. Usage: bash b.sh <command...>   e.g.  bash b.sh anchor build
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$HOME/.avm/bin:$HOME/.local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
export ANCHOR_WALLET="${ANCHOR_WALLET:-$HOME/.config/solana/id.json}"
export ANCHOR_PROVIDER_URL="${ANCHOR_PROVIDER_URL:?set ANCHOR_PROVIDER_URL to your RPC url}"
cd "$(dirname "$(readlink -f "$0")")"
exec "$@"
