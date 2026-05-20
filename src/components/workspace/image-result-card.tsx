"use client";

import { useState } from "react";
import type { SourcePhoto } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Loader2, AlertCircle, Check, Send } from "lucide-react";

interface ImageResultCardProps {
  photo: SourcePhoto;
  selected: boolean;
  onSelect: () => void;
  onRedo: () => void;
  onRegenerate: (feedback: string) => void;
}

function settingsSummary(photo: SourcePhoto): string {
  if (photo.label) return photo.label;
  return photo.usedSettings.presetName || photo.name;
}

export function ImageResultCard({ photo, selected, onSelect, onRedo, onRegenerate }: ImageResultCardProps) {
  const isDone = photo.status === "done";
  const isFinished = isDone || photo.status === "error";
  const [feedback, setFeedback] = useState("");

  const handleRegenerate = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!feedback.trim()) return;
    onRegenerate(feedback.trim());
    setFeedback("");
  };

  const handleCardKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isDone) return;
    if (e.key !== "Enter" && e.key !== " ") return;

    e.preventDefault();
    onSelect();
  };

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-card transition-all [contain-intrinsic-size:400px] [content-visibility:auto] ${
        isDone ? "cursor-pointer" : ""
      } ${
        selected ? "ring-2 ring-primary border-primary" : isDone ? "hover:border-primary/30" : ""
      }`}
      role={isDone ? "button" : undefined}
      tabIndex={isDone ? 0 : undefined}
      aria-label={isDone ? `${selected ? "Deselect" : "Select"} ${photo.name}` : undefined}
      aria-pressed={isDone ? selected : undefined}
      onClick={() => isDone && onSelect()}
      onKeyDown={handleCardKeyDown}
    >
      <div className="relative aspect-square bg-muted/10 flex items-center justify-center overflow-hidden">
        {photo.status === "processing" && (
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-xs text-muted-foreground mt-3">Processing...</p>
          </div>
        )}
        {photo.status === "pending" && (
          <p className="text-xs text-muted-foreground">Queued</p>
        )}
        {isDone && photo.resultUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.resultUrl}
            alt={`Result: ${photo.name}`}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        )}
        {photo.status === "error" && (
          <div className="text-center px-4">
            <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
            <p className="text-xs text-destructive mt-2 line-clamp-3">{photo.error || "Failed"}</p>
          </div>
        )}

        <div className="absolute bottom-2 left-2 h-14 w-14 rounded-md border-2 border-background overflow-hidden shadow-md bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.previewUrl}
            alt={photo.name}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
          />
        </div>

        {isDone && (
          <div className="absolute top-2 left-2">
            <div
              className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                selected
                  ? "bg-primary border-primary"
                  : "border-white/60 bg-black/20"
              }`}
            >
              {selected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
            </div>
          </div>
        )}

        <div className="absolute top-2 right-2">
          <Badge variant="secondary" className="text-[10px] bg-background/80 backdrop-blur-sm">
            {photo.usedSettings.presetName || photo.usedSettings.shotMode}
          </Badge>
        </div>
      </div>

      <div className="px-3 py-2 border-t space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-[11px] text-muted-foreground truncate">
              {settingsSummary(photo)}
            </p>
            {photo.cost > 0 && (
              <span className="text-[10px] text-muted-foreground/60 shrink-0">
                ${photo.cost.toFixed(3)}
              </span>
            )}
          </div>
          {isFinished && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs shrink-0 px-2"
              aria-label={`Redo ${photo.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onRedo();
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Redo
            </Button>
          )}
        </div>

        {isDone && (
          <form
            onSubmit={handleRegenerate}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex gap-1.5"
          >
            <Input
              placeholder="Fix: e.g. remove wrinkles, brighter..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="h-7 text-xs flex-1"
            />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 shrink-0"
              disabled={!feedback.trim()}
              aria-label={`Regenerate ${photo.name}`}
            >
              <Send className="h-3 w-3" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
