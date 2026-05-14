"use client";

import { useCallback, useRef, useState } from "react";
import { Upload } from "lucide-react";

interface ImageDropAreaProps {
  onFiles: (files: File[]) => void;
  compact: boolean;
}

export function ImageDropArea({ onFiles, compact }: ImageDropAreaProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
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
      <div className="mx-6 mt-4 shrink-0">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg px-4 py-2.5 flex items-center gap-3 cursor-pointer transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
          }`}
        >
          <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleChange} />
          <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">
            Drop more or <span className="text-primary underline underline-offset-2">browse</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-md text-center">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl px-8 py-12 cursor-pointer transition-all ${
            dragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50"
          }`}
        >
          <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleChange} />
          <Upload className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium mb-1">Drop product photos</p>
          <p className="text-xs text-muted-foreground">
            Processes immediately with current settings
          </p>
          <p className="text-[11px] text-muted-foreground/50 mt-2">PNG, JPG, WEBP</p>
        </div>
      </div>
    </div>
  );
}
