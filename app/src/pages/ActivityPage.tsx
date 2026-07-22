import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { GlobalActivity } from "../components/GlobalActivity";

export function ActivityPage() {
  return (
    <div className="min-h-screen">
      <Nav page="activity" wide />
      <GlobalActivity />
      <Footer wide />
    </div>
  );
}
