import { Nav } from "../components/Nav";
import { MarketDetail } from "../components/MarketDetail";
import { Footer } from "../components/Footer";

export function MarketPage({ fixtureId }: { fixtureId: number }) {
  return (
    <div className="min-h-screen">
      <Nav page="market" wide />
      <MarketDetail fixtureId={fixtureId} />
      <Footer wide />
    </div>
  );
}
