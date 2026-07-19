import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

// Record an on-chain action against the user's wallet.
export const record = mutation({
  args: {
    wallet: v.string(),
    market: v.string(),
    fixtureId: v.number(),
    kind: v.string(),
    outcome: v.optional(v.number()),
    amount: v.optional(v.number()),
    sig: v.string(),
    ts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("predictions", { ...args, ts: args.ts ?? Date.now() });
  },
});

// Pull a wallet's past actions (most recent first).
export const byWallet = query({
  args: { wallet: v.string() },
  handler: async (ctx, { wallet }) =>
    ctx.db
      .query("predictions")
      .withIndex("by_wallet", (q) => q.eq("wallet", wallet))
      .order("desc")
      .take(50),
});
