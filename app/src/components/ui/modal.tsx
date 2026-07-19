import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

export function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    if (open) {
      window.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
    }
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  // Portal to <body>: `position: fixed` breaks inside transformed ancestors (the Lenis smooth-scroll
  // wrapper, animated sections), which clipped modals to half the screen. From <body> it always
  // centers in the real viewport.
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        style={{ animation: "modalpop .16s ease-out" }}>
        <style>{"@keyframes modalpop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}"}</style>
        <button onClick={onClose} aria-label="Close"
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground">
          <X size={18} />
        </button>
        {title && <div className="mb-4 pr-8 font-display text-lg font-bold">{title}</div>}
        {children}
      </div>
    </div>,
    document.body
  );
}
