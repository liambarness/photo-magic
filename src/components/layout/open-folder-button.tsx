"use client";

import { useCallback } from "react";
import { FolderOpen } from "lucide-react";
import { toast } from "sonner";

function batchFolder(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OpenFolderButton() {
  const handleOpenFolder = useCallback(async () => {
    try {
      await fetch("/api/open-folder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subfolder: batchFolder() }),
      });
    } catch {
      toast.error("Could not open folder");
    }
  }, []);

  return (
    <button
      onClick={handleOpenFolder}
      className="inline-flex items-center justify-center h-9 px-2.5 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer gap-1.5 text-xs text-muted-foreground"
    >
      <FolderOpen className="h-4 w-4" />
      <span>Images</span>
    </button>
  );
}
