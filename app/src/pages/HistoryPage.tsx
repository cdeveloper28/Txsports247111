import { Nav } from "../components/Nav";
import { HistorySection } from "../components/HistorySection";
import { Footer } from "../components/Footer";

export function HistoryPage() {
  return (
    <div className="min-h-screen">
      <Nav page="history" wide />
      <HistorySection />
      <Footer wide />
    </div>
  );
}
