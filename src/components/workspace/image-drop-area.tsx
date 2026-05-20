"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { uploadLimitSummary } from "@/lib/validation";

interface ImageDropAreaProps {
  onFiles: (files: File[]) => void;
  compact: boolean;
}

export function ImageDropArea({ onFiles, compact }: ImageDropAreaProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const limitText = uploadLimitSummary();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length) onFiles(files);
      e.target.value = "";
    },
    [onFiles]
  );

  if (compact) {
    return (
      <div className="pointer-events-auto w-full max-w-xl min-w-0">
        <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleChange} />
        <button
          type="button"
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
          onDragLeave={(e) => { e.stopPropagation(); setDragging(false); }}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`group flex h-12 w-full items-center justify-between gap-3 rounded-full border bg-background/95 px-4 text-left shadow-lg ring-1 ring-foreground/5 backdrop-blur transition-all ${
            dragging ? "border-primary bg-primary/5 shadow-xl" : "border-border hover:border-primary/50 hover:shadow-xl"
          }`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              <Upload className="h-3.5 w-3.5" />
            </span>
            <span className="truncate text-sm text-foreground">
              Drop images, paste, or <span className="text-primary underline underline-offset-2">browse</span>
            </span>
          </span>
          <span className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground sm:inline">
            limits
          </span>
        </button>
        <p className="mx-auto mt-2 max-w-lg px-4 text-center text-[11px] text-muted-foreground/60">
          {limitText}
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleChange} />
        <button
          type="button"
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
          onDragLeave={(e) => { e.stopPropagation(); setDragging(false); }}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`w-full rounded-xl border-2 border-dashed px-8 py-12 text-center transition-all ${
            dragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50"
          }`}
        >
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium mb-1">Drop product photos</p>
          <p className="text-xs text-muted-foreground">
            Preview before processing with current settings
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground/50">{limitText}</p>
        </button>
      </div>
    </div>
  );
}
