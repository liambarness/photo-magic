"use client";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SettingsDialog } from "@/components/layout/settings-dialog";
import { ParameterSidebar } from "@/components/parameters/parameter-sidebar";
import { Workspace } from "@/components/workspace/workspace";

export default function Home() {
  return (
    <div className="flex flex-col h-full bg-background">
      <header className="flex items-center justify-between px-6 h-14 border-b shrink-0">
        <h1 className="font-heading text-2xl tracking-wide uppercase whitespace-nowrap">
          Photo Magic
        </h1>
        <div className="flex items-center gap-1">
          <SettingsDialog />
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <ParameterSidebar />
        <Workspace />
      </div>
    </div>
  );
}
