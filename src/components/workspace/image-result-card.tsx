"use client";

import { useState } from "react";
import type { SourcePhoto } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Loader2, AlertCircle, Check, Send, Archive, RotateCcwSquare, Trash2 } from "lucide-react";

interface ImageResultCardProps {
  photo: SourcePhoto;
  selected: boolean;
  imageReady: boolean;
  onSelect: () => void;
  onRedo: () => void;
  onRegenerate: (feedback: string) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onImageReady: () => void;
}

function settingsSummary(photo: SourcePhoto): string {
  if (photo.label) return photo.label;
  return photo.usedSettings.presetName || photo.name;
}

function modelSummary(photo: SourcePhoto): string | null {
  if (photo.usedSettings.shotMode !== "model") return null;
  const parts = [
    photo.usedSettings.modelProfileName,
    photo.usedSettings.productGroupLabel,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : null;
}

function workflowSummary(photo: SourcePhoto): string | null {
  if (photo.usedSettings.shotMode === "model") return modelSummary(photo);
  if (photo.usedSettings.shotMode === "touchup") {
    const strength = photo.usedSettings.touchUpStrength ?? "standard";
    return `Touch Up - ${strength}`;
  }
  return null;
}

function generationDebugSummary(photo: SourcePhoto): string | null {
  const debug = photo.generationDebug;
  if (!debug) return null;

  const kind =
    debug.modelProfileKind === "human"
      ? "Human"
      : debug.modelProfileKind === "ai"
        ? "AI"
        : debug.modelProfileKind === "missing"
          ? "Missing profile"
          : "No profile";

  const refs = debug.faceReferenceCount > 0 ? `refs ${debug.faceReferenceCount}` : "refs 0";
  const inputs = `inputs ${debug.inputImageCount}`;
  const fidelity = debug.inputFidelity ? `fidelity ${debug.inputFidelity}` : "fidelity auto";

  return `${kind} - ${refs} - ${inputs} - ${fidelity}`;
}

export function ImageResultCard({
  photo,
  selected,
  imageReady,
  onSelect,
  onRedo,
  onRegenerate,
  onArchive,
  onRestore,
  onDelete,
  onImageReady,
}: ImageResultCardProps) {
  const isDone = photo.status === "done";
  const isFinished = isDone || photo.status === "error";
  const isArchived = photo.visibility === "archived";
  const pendingLabel = photo.serverPath ? "Queued" : "Uploading and labeling...";
  const workflowLabel = workflowSummary(photo);
  const generationDebugLabel = generationDebugSummary(photo);
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
          <div className="text-center">
            {!photo.serverPath && (
              <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" />
            )}
            <p className="text-xs text-muted-foreground">{pendingLabel}</p>
          </div>
        )}
        {isDone && photo.resultUrl && (
          <>
            {!imageReady && (
              <ImageSkeleton previewUrl={photo.previewUrl} />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.resultUrl}
              alt={`Result: ${photo.name}`}
              className={`h-full w-full object-cover transition-opacity duration-150 ${
                imageReady ? "opacity-100" : "opacity-0"
              }`}
              loading="lazy"
              decoding="async"
              onLoad={onImageReady}
              onError={onImageReady}
            />
          </>
        )}
        {photo.status === "error" && (
          <div className="text-center px-4">
            <AlertCircle className="h-6 w-6 text-destructive mx-auto" />
            <p className="text-xs text-destructive mt-2 line-clamp-3">{photo.error || "Failed"}</p>
          </div>
        )}

        <div className="absolute bottom-2 left-2 h-14 w-14 overflow-hidden rounded-md border-2 border-background bg-muted/20 shadow-md">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.previewUrl}
            alt={photo.name}
            className={`h-full w-full object-cover ${isDone && !imageReady ? "opacity-70" : ""}`}
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

        <div className="absolute right-2 top-2 flex items-center gap-1">
          <Badge variant="secondary" className="text-[10px] bg-background/80 backdrop-blur-sm">
            {isArchived ? "Archived" : photo.usedSettings.presetName || photo.usedSettings.shotMode}
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="bg-background/80 backdrop-blur-sm hover:bg-background"
            aria-label={isArchived ? `Restore ${photo.name}` : `Archive ${photo.name}`}
            title={isArchived ? "Restore" : "Archive"}
            onClick={(e) => {
              e.stopPropagation();
              if (isArchived) onRestore();
              else onArchive();
            }}
          >
            {isArchived ? <RotateCcwSquare className="h-3 w-3" /> : <Archive className="h-3 w-3" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="bg-background/80 text-destructive backdrop-blur-sm hover:bg-destructive/10 hover:text-destructive"
            aria-label={`Delete ${photo.name}`}
            title="Delete permanently"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="px-3 py-2 border-t space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 space-y-0.5">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-[11px] text-muted-foreground">
                {settingsSummary(photo)}
              </p>
              {photo.cost > 0 && (
                <span className="shrink-0 text-[10px] text-muted-foreground/60">
                  ${photo.cost.toFixed(3)}
                </span>
              )}
            </div>
            {workflowLabel && (
              <p className="truncate text-[10px] text-muted-foreground/60">
                {workflowLabel}
              </p>
            )}
            {generationDebugLabel && (
              <p className="truncate text-[10px] text-muted-foreground/60" title={generationDebugLabel}>
                {generationDebugLabel}
              </p>
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

function ImageSkeleton({ previewUrl }: { previewUrl: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-muted/30">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={previewUrl}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full scale-105 object-cover opacity-45 blur-sm"
        loading="lazy"
        decoding="async"
      />
      <div className="absolute inset-0 animate-pulse bg-background/35" />
      <div className="relative rounded-full border border-border bg-background/80 px-3 py-1.5 text-[11px] text-muted-foreground shadow-sm">
        Loading render...
      </div>
    </div>
  );
}
