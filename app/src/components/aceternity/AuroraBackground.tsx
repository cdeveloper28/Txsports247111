import * as React from "react";

/** Flat Phantom-black backdrop with a subtle grid (no gradients). */
export function AuroraBackground({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={"relative overflow-hidden " + className}>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid" />
      </div>
      {children}
    </div>
  );
}
