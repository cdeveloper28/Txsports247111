import "./polyfills";
import React, { useEffect, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ConnectionProvider, WalletProvider, useWallet } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { WalletAdapterNetwork, type Adapter } from "@solana/wallet-adapter-base";
import { WalletConnectWalletAdapter } from "@solana/wallet-adapter-walletconnect";
import "@solana/wallet-adapter-react-ui/styles.css";
import App from "./App";
import "./index.css";

const RPC = import.meta.env.VITE_RPC_URL ?? "https://api.devnet.solana.com";
const REOWN_ID = import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined;

/**
 * Escape hatch for the "stuck at Connecting…" bug: on refresh, autoConnect re-tries the wallet
 * remembered in localStorage. If that adapter never resolves (stale WalletConnect session, wallet
 * extension not ready), the button shows "Connecting…" forever and disconnect is a no-op. After
 * 10s of connecting we forget the remembered wallet and deselect, returning to "Select Wallet".
 */
function ConnectWatchdog() {
  const { connecting, select } = useWallet();
  useEffect(() => {
    if (!connecting) return;
    const t = setTimeout(() => {
      try { localStorage.removeItem("walletName"); } catch { /* private mode */ }
      select(null);
    }, 10_000);
    return () => clearTimeout(t);
  }, [connecting, select]);
  return null;
}

function Root() {
  // Phantom / Solflare / Backpack auto-register via the Wallet Standard; Reown (WalletConnect)
  // is added explicitly as a secondary option when a project id is configured.
  const wallets = useMemo<Adapter[]>(() => {
    const list: Adapter[] = [];
    if (REOWN_ID) {
      list.push(
        new WalletConnectWalletAdapter({
          network: WalletAdapterNetwork.Devnet,
          options: {
            projectId: REOWN_ID,
            metadata: {
              name: "Txsports",
              description: "Trustless World Cup prediction markets",
              url: typeof window !== "undefined" ? window.location.origin : "https://txsports.app",
              icons: ["https://avatars.githubusercontent.com/u/35608259"],
            },
          },
        }) as unknown as Adapter
      );
    }
    return list;
  }, []);

  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider
        wallets={wallets}
        autoConnect
        onError={(e) => {
          // Surface adapter failures instead of silently wedging the connect button; a failed
          // (auto)connect also forgets the remembered wallet so the next refresh starts clean.
          console.warn("[wallet]", e?.name ?? "error", e?.message ?? e);
          try { localStorage.removeItem("walletName"); } catch { /* private mode */ }
        }}
      >
        <WalletModalProvider>
          <ConnectWatchdog />
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
