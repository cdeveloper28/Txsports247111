import { Nav } from "../components/Nav";
import { Hero } from "../components/Hero";
import { Showcase } from "../components/Showcase";
import { Proof } from "../components/Proof";
import { Mechanics } from "../components/Mechanics";
import { Footer } from "../components/Footer";
import { Button } from "../components/ui/button";
import { ArrowRight } from "@phosphor-icons/react";

function FinalCTA() {
  return (
    <section className="container py-12">
      <div className="flex flex-col items-start justify-between gap-6 rounded-xl border border-border bg-card px-7 py-8 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Ready to predict?</h2>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
            Open a World Cup market and settle it with a cryptographic proof. No bookmaker, no oracle, no admin key.
          </p>
        </div>
        <Button size="lg" variant="success" className="shrink-0" asChild>
          <a href="#/app">
            Predict now <ArrowRight weight="bold" size={18} />
          </a>
        </Button>
      </div>
    </section>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen">
      <Nav page="landing" />
      <Hero />
      <Showcase />
      <Mechanics />
      <Proof />
      <FinalCTA />
      <Footer />
    </div>
  );
}
