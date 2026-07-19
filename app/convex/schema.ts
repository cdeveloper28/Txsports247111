import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// A user's wallet address is their identity: predictions are keyed by wallet so past actions
// can be pulled back on reconnect.
export default defineSchema({
  predictions: defineTable({
    wallet: v.string(),
    market: v.string(),
    fixtureId: v.number(),
    kind: v.string(), // "bet" | "settle" | "claim"
    outcome: v.optional(v.number()), // 0 Home / 1 Draw / 2 Away
    amount: v.optional(v.number()), // SOL staked (for bets)
    sig: v.string(), // Solana tx signature
    ts: v.number(),
  }).index("by_wallet", ["wallet"]),
});
