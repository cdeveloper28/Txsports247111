import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["cautious-bat.outray.app"]
  },
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