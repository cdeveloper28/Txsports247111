import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Browser polyfills for Buffer/global that @solana/web3.js + anchor expect.
export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
    "process.env": {},
  },
  resolve: {
    alias: { buffer: "buffer" },
  },
  optimizeDeps: {
    esbuildOptions: { define: { global: "globalThis" } },
    include: ["buffer", "bn.js", "@coral-xyz/anchor", "@solana/web3.js"],
  },
});
