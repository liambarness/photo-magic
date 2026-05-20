"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SettingsDialog } from "@/components/layout/settings-dialog";
import { ParameterSidebar } from "@/components/parameters/parameter-sidebar";
import { Workspace } from "@/components/workspace/workspace";

export default function Home() {
  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 sm:px-6">
        <h1 className="font-heading text-xl tracking-wide uppercase whitespace-nowrap sm:text-2xl">
          Photo Magic
        </h1>
        <div className="flex items-center gap-1">
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
