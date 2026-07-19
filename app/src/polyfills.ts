import { Buffer } from "buffer";
// @solana/web3.js + anchor expect Node globals in the browser.
(window as any).global = window;
(window as any).Buffer = Buffer;
