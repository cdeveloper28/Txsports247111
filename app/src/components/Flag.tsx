import { countryCode } from "../lib/flags";

// Real flag image (emoji flags don't render on Windows). Falls back to a neutral chip.
// `big` renders a card-sized flag; otherwise it sits inline with text.
export function Flag({ team, className = "", big = false }: { team?: string; className?: string; big?: boolean }) {
  const code = countryCode(team);
  const size = big ? "h-7 w-10 rounded-md" : "h-[0.8em] w-[1.25em] rounded-[2px] align-[-0.05em]";
  const cls = `inline-block shrink-0 object-cover ring-1 ring-black/10 ${size} ${className}`;
  if (!code) return <span className={cls + " bg-secondary"} aria-hidden />;
  return (
    <img
      src={`https://flagcdn.com/${code}.svg`}
      alt=""
      loading="lazy"
      className={cls}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }}
    />
  );
}
