"use client";

import { useCallback, useState } from "react";
import { useAppStore } from "@/stores/use-app-store";
import { ImageDropArea } from "./image-drop-area";
import { ImageResultCard } from "./image-result-card";
import { Button } from "@/components/ui/button";
import { Download, CheckSquare, X } from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/use-settings-store";
import type { SourcePhoto } from "@/types";

async function runPool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function next(): Promise<void> {
    const idx = i++;
    if (idx >= tasks.length) return;
    results[idx] = await tasks[idx]();
    await next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, () => next()));
  return results;
}

function batchFolder(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Workspace() {
  const photos = useAppStore((s) => s.photos);
  const addPhotos = useAppStore((s) => s.addPhotos);
  const updatePhotoLabel = useAppStore((s) => s.updatePhotoLabel);
  const getActivePrompt = useAppStore((s) => s.getActivePrompt);
  const snapshotSettings = useAppStore((s) => s.snapshotSettings);
  const setPhotoStatus = useAppStore((s) => s.setPhotoStatus);
  const resetSinglePhoto = useAppStore((s) => s.resetSinglePhoto);
  const concurrency = useSettingsStore((s) => s.concurrency);
  const imageSize = useSettingsStore((s) => s.imageSize);
  const imageQuality = useSettingsStore((s) => s.imageQuality);
  const outputFormat = useSettingsStore((s) => s.outputFormat);
  const timeoutMs = useSettingsStore((s) => s.timeoutSeconds) * 1000;
  const selectedIds = useAppStore((s) => s.selectedIds);
  const toggleSelect = useAppStore((s) => s.toggleSelect);
  const selectAll = useAppStore((s) => s.selectAll);
  const clearSelection = useAppStore((s) => s.clearSelection);

  const [dragging, setDragging] = useState(false);
  const folder = batchFolder();

  const processPhoto = useCallback(
    async (photoId: string, prompt: string, extraFeedback?: string) => {
      setPhotoStatus(photoId, "processing");

      let finalPrompt = prompt;
      if (extraFeedback) {
        finalPrompt += ` IMPORTANT fix requested: ${extraFeedback}.`;
      }

      const photo = useAppStore.getState().photos.find((p) => p.id === photoId);
      const label = photo?.label || "";

      try {
        const res = await fetch("/api/touch-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder, photoId, label, prompt: finalPrompt, imageSize, imageQuality, outputFormat }),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (!res.ok) {
          const err = await res.text();
          setPhotoStatus(photoId, "error", null, err);
          return;
        }

        const data = await res.json();
        setPhotoStatus(photoId, "done", data.resultUrl, null, data.cost ?? 0, data.usage ?? null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed";
        setPhotoStatus(photoId, "error", null, msg);
      }
    },
    [setPhotoStatus, folder, imageSize, imageQuality, outputFormat, timeoutMs]
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      const prompt = getActivePrompt();
      if (!prompt) {
        toast.error("Select a preset first.");
        return;
      }

      const settings = snapshotSettings();

      const newPhotos: SourcePhoto[] = files.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        label: "",
        previewUrl: URL.createObjectURL(f),
        serverPath: null,
        status: "pending" as const,
        resultUrl: null,
        error: null,
        usedSettings: settings,
        cost: 0,
        usage: null,
      }));

      addPhotos(newPhotos);

      const formData = new FormData();
      formData.append("folder", folder);
      formData.append("product", settings.presetName);
      formData.append("shotType", settings.shotMode);
      files.forEach((f, i) => {
        formData.append("files", f);
        formData.append("ids", newPhotos[i].id);
      });

      try {
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        const uploadData = await uploadRes.json();
        if (uploadData.results) {
          for (const r of uploadData.results) {
            if (r.label) updatePhotoLabel(r.id, r.label);
          }
        }
      } catch {
        toast.error("Upload failed");
        return;
      }

      await runPool(newPhotos.map((p) => () => processPhoto(p.id, prompt)), concurrency);

      toast.success(`${newPhotos.length} image${newPhotos.length > 1 ? "s" : ""} processed`);
    },
    [addPhotos, updatePhotoLabel, processPhoto, snapshotSettings, getActivePrompt, folder, concurrency]
  );

  const handleRedo = useCallback(
    async (photoId: string) => {
      const prompt = getActivePrompt();
      if (!prompt) {
        toast.error("No prompt available. Select a preset first.");
        return;
      }
      resetSinglePhoto(photoId);
      await processPhoto(photoId, prompt);
    },
    [resetSinglePhoto, processPhoto, getActivePrompt]
  );

  const handleRegenerate = useCallback(
    async (photoId: string, feedback: string) => {
      const prompt = getActivePrompt();
      if (!prompt) {
        toast.error("No prompt available. Select a preset first.");
        return;
      }
      resetSinglePhoto(photoId);
      await processPhoto(photoId, prompt, feedback);
    },
    [resetSinglePhoto, processPhoto, getActivePrompt]
  );

  const handleExport = useCallback(async () => {
    const toExport = photos.filter(
      (p) => selectedIds.includes(p.id) && p.status === "done" && p.resultUrl
    );
    if (toExport.length === 0) return;

    for (const photo of toExport) {
      try {
        const res = await fetch(photo.resultUrl!);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ext = photo.resultUrl!.split("?")[0].split(".").pop() || "png";
        const name = photo.label || photo.id.slice(0, 8);
        a.download = `${name}.${ext}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error(`Failed to download ${photo.name}`);
      }
    }

    toast.success(`${toExport.length} image${toExport.length > 1 ? "s" : ""} exported`);
    clearSelection();
  }, [photos, selectedIds, clearSelection]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith("image/")
      );
      if (files.length) handleFiles(files);
    },
    [handleFiles]
  );

  const hasPhotos = photos.length > 0;
  const doneCount = photos.filter((p) => p.status === "done").length;
  const selectedCount = selectedIds.length;
  const totalCost = photos.reduce((sum, p) => sum + p.cost, 0);

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden relative"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={handleDrop}
    >
      {dragging && (
        <div className="absolute inset-0 z-50 bg-primary/5 border-2 border-dashed border-primary rounded-lg m-2 flex items-center justify-center pointer-events-none">
          <p className="text-lg font-medium text-primary">Drop images anywhere</p>
        </div>
      )}

      {!hasPhotos && (
        <ImageDropArea onFiles={handleFiles} compact={false} />
      )}

      {hasPhotos && (
        <>
          <div className="mx-6 mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedCount > 0 ? (
                <>
                  <span className="text-xs text-muted-foreground">
                    {selectedCount} selected
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={clearSelection}
                  >
                    <X className="h-3 w-3 mr-1" />
                    Clear
                  </Button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {photos.length} result{photos.length !== 1 ? "s" : ""}
                </span>
              )}
              {totalCost > 0 && (
                <span className="text-xs text-muted-foreground/60">
                  · ${totalCost.toFixed(3)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {doneCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={selectAll}
                >
                  <CheckSquare className="h-3 w-3 mr-1" />
                  Select All
                </Button>
              )}
              {selectedCount > 0 && (
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleExport}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Export ({selectedCount})
                </Button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 pt-3">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
              {photos.map((photo) => (
                <ImageResultCard
                  key={photo.id}
                  photo={photo}
                  selected={selectedIds.includes(photo.id)}
                  onSelect={() => toggleSelect(photo.id)}
                  onRedo={() => handleRedo(photo.id)}
                  onRegenerate={(fb) => handleRegenerate(photo.id, fb)}
                />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
