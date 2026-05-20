"use client";

import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";

type ScrapeState = "idle" | "scraping" | "done";

export function CollectionScraper() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ScrapeState>("idle");
  const [expanded, setExpanded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const handleScrape = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    abortRef.current = new AbortController();
    setState("scraping");

    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Download failed" }));
        throw new Error(err.error || `Server returned ${res.status}`);
      }

      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || "collection.zip";

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);

      const imgCount = res.headers.get("X-Images-Zipped") ?? "?";
      const productCount = res.headers.get("X-Products") ?? "?";

      setState("done");
      toast.success(`Downloaded ${filename} — ${imgCount} images from ${productCount} products`);
      setTimeout(() => {
        setState("idle");
        setUrl("");
        setExpanded(false);
      }, 2000);
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setState("idle");
        return;
      }
      setState("idle");
      toast.error((err as Error).message || "Scrape failed");
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setState("idle");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && state === "idle") handleScrape();
    if (e.key === "Escape") {
      setExpanded(false);
      setUrl("");
    }
  };

  if (!expanded) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
        onClick={() => setExpanded(true)}
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Scrape</span>
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="relative">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste collection URL..."
          disabled={state === "scraping"}
          autoFocus
          className="h-8 w-48 pr-7 text-xs sm:w-64"
        />
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setUrl("");
            handleCancel();
          }}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2.5 text-xs"
        disabled={!url.trim() || state === "scraping"}
        onClick={state === "scraping" ? handleCancel : handleScrape}
      >
        {state === "scraping" ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="hidden sm:inline">Downloading...</span>
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Go</span>
          </>
        )}
      </Button>
    </div>
  );
}
