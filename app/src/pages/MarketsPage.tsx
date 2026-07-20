import { Nav } from "../components/Nav";
import { MarketsGrid } from "../components/MarketsGrid";
import { MarketPulse } from "../components/MarketPulse";
import { BetsMarquee } from "../components/BetsMarquee";
import { Footer } from "../components/Footer";
import { Onboarding } from "../components/Onboarding";

export function MarketsPage() {
  return (
    <div className="min-h-screen">
      <Onboarding />
      <Nav page="market" wide />
      <BetsMarquee bar />
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:gap-8">
          <MarketsGrid />
          <MarketPulse />
        </div>
      </div>
      <Footer wide />
    </div>
  );
}
