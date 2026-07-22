import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { Landing } from "./pages/Landing";
import { MarketsPage } from "./pages/MarketsPage";
import { MarketPage } from "./pages/MarketPage";
import { HistoryPage } from "./pages/HistoryPage";
import { ActivityPage } from "./pages/ActivityPage";
import { DevelopersPage } from "./pages/DevelopersPage";
import { initSmoothScroll, scrollToTop } from "./lib/smoothScroll";

function useHashRoute() {
  const get = () => window.location.hash.replace(/^#\/?/, "");
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => { setRoute(get()); scrollToTop(); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  useEffect(() => { initSmoothScroll(); }, []);
  const seg = route.split("/").filter(Boolean);
  const page =
    seg[0] === "app" && seg[1] ? <MarketPage fixtureId={Number(seg[1])} />
    : seg[0] === "app" ? <MarketsPage />
    : seg[0] === "history" ? <HistoryPage />
    : seg[0] === "activity" ? <ActivityPage />
    : seg[0] === "developers" ? <DevelopersPage />
    : <Landing />;
  return (
    <>
      {page}
      <Toaster theme="dark" position="bottom-right" richColors closeButton toastOptions={{ className: "font-sans" }} />
    </>
  );
}
