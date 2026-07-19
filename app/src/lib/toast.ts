import { toast as sonner } from "sonner";

// Thin wrapper over Sonner so the existing `toast.success/error/info/win(title, body?)` call sites
// keep working unchanged. <Toaster/> (from sonner) is mounted once in App.
const opt = (b?: string) => (b ? { description: b } : undefined);

export const toast = {
  success: (t: string, b?: string) => sonner.success(t, opt(b)),
  error: (t: string, b?: string) => sonner.error(t, opt(b)),
  info: (t: string, b?: string) => sonner.message(t, opt(b)),
  win: (t: string, b?: string) => sonner.success(t, opt(b)),
};
