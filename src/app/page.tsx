"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SettingsDialog } from "@/components/layout/settings-dialog";
import { CollectionScraper } from "@/components/layout/collection-scraper";
import { ParameterSidebar } from "@/components/parameters/parameter-sidebar";
import { Workspace } from "@/components/workspace/workspace";
import { useAppStore } from "@/stores/use-app-store";

export default function Home() {
  const goHome = useAppStore((s) => s.goHome);

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
        <button
          type="button"
          className="font-heading text-xl tracking-wide uppercase whitespace-nowrap transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-2xl"
          aria-label="Return to all products"
          onClick={goHome}
        >
          Photo Magic
        </button>
        <div className="flex items-center gap-1.5">
          <CollectionScraper />
          <SettingsDialog />
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <ParameterSidebar />
        <Workspace />
      </div>
    </div>
  );
}
