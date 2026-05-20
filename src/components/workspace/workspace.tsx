"use client";

import { useCallback, useMemo, useState } from "react";
import { useAppStore } from "@/stores/use-app-store";
import { ImageDropArea } from "./image-drop-area";
import { ImageResultCard } from "./image-result-card";
import { Button } from "@/components/ui/button";
import { Download, CheckSquare, X } from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/use-settings-store";
import type { SourcePhoto } from "@/types";

const INITIAL_VISIBLE_RESULTS = 24;
const VISIBLE_RESULTS_STEP = 24;

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

function imageExtension(url: string): string {
  const source = url.startsWith("/api/blob?")
    ? new URL(url, window.location.origin).searchParams.get("url") ?? url
    : url;
  return source.split("?")[0].split(".").pop() || "png";
}

async function saveHistory(photos: SourcePhoto[]): Promise<void> {
  if (photos.length === 0) return;

  const res = await fetch("/api/history", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photos }),
  });
  if (!res.ok) throw new Error("History save failed");
}

function revokeLocalPreviews(photos: SourcePhoto[]) {
  photos.forEach((photo) => {
    if (photo.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(photo.previewUrl);
    }
  });
}

export function Workspace() {
  const photos = useAppStore((s) => s.photos);
  const addPhotos = useAppStore((s) => s.addPhotos);
  const updatePhotoUpload = useAppStore((s) => s.updatePhotoUpload);
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
  const historyLoaded = useAppStore((s) => s._historyLoaded);
  const toggleSelect = useAppStore((s) => s.toggleSelect);
  const selectAll = useAppStore((s) => s.selectAll);
  const clearSelection = useAppStore((s) => s.clearSelection);

  const [dragging, setDragging] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_RESULTS);
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
      const batchFolder = photo?.batchFolder || folder;
      const sourceUrl = photo?.serverPath || photo?.previewUrl || "";

      try {
        const res = await fetch("/api/touch-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folder: batchFolder, photoId, label, sourceUrl, prompt: finalPrompt, imageSize, imageQuality, outputFormat }),
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
        batchFolder: folder,
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
      formData.append("settings", JSON.stringify(settings));
      files.forEach((f, i) => {
        formData.append("files", f);
        formData.append("ids", newPhotos[i].id);
      });

      try {
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          const err = await uploadRes.text();
          newPhotos.forEach((p) => setPhotoStatus(p.id, "error", null, err));
          revokeLocalPreviews(newPhotos);
          toast.error("Upload failed");
          return;
        }

        const uploadData = await uploadRes.json();
        const uploadedIds = new Set<string>();
        if (uploadData.results) {
          for (const r of uploadData.results) {
            uploadedIds.add(r.id);
            const localPreview = newPhotos.find((photo) => photo.id === r.id)?.previewUrl;
            if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
            updatePhotoUpload(r.id, {
              label: r.label || "",
              previewUrl: r.servingUrl,
              serverPath: r.serverPath,
            });
          }
        }

        const missingUploads = newPhotos.filter((p) => !uploadedIds.has(p.id));
        missingUploads.forEach((p) => setPhotoStatus(p.id, "error", null, "Upload did not return a source image"));
      } catch {
        newPhotos.forEach((p) => setPhotoStatus(p.id, "error", null, "Upload failed"));
        revokeLocalPreviews(newPhotos);
        toast.error("Upload failed");
        return;
      }

      const uploadedPhotos = useAppStore
        .getState()
        .photos.filter((p) => newPhotos.some((photo) => photo.id === p.id && p.serverPath));

      if (uploadedPhotos.length === 0) return;

      await runPool(uploadedPhotos.map((p) => () => processPhoto(p.id, prompt)), concurrency);
      const processedIds = new Set(uploadedPhotos.map((p) => p.id));
      const processedPhotos = useAppStore
        .getState()
        .photos.filter((p) => processedIds.has(p.id));
      try {
        await saveHistory(processedPhotos);
      } catch {
        toast.error("Processed images saved, but history did not update.");
      }

      toast.success(`${uploadedPhotos.length} image${uploadedPhotos.length > 1 ? "s" : ""} processed`);
    },
    [addPhotos, updatePhotoUpload, processPhoto, snapshotSettings, getActivePrompt, folder, concurrency, setPhotoStatus]
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
      const photo = useAppStore.getState().photos.find((p) => p.id === photoId);
      try {
        if (photo) await saveHistory([photo]);
      } catch {
        toast.error("Redo finished, but history did not update.");
      }
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
      const photo = useAppStore.getState().photos.find((p) => p.id === photoId);
      try {
        if (photo) await saveHistory([photo]);
      } catch {
        toast.error("Regenerate finished, but history did not update.");
      }
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
        const ext = imageExtension(photo.resultUrl!);
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
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visiblePhotos = useMemo(
    () => photos.slice(0, visibleCount),
    [photos, visibleCount]
  );
  const totalCost = photos.reduce((sum, p) => sum + p.cost, 0);
  const hiddenCount = Math.max(0, photos.length - visiblePhotos.length);

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden relative"
      onDragOver={(e) => {
        if (!hasPhotos) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!hasPhotos) return;
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={hasPhotos ? handleDrop : undefined}
    >
      {hasPhotos && dragging && (
        <div className="absolute inset-0 z-50 bg-primary/5 border-2 border-dashed border-primary rounded-lg m-2 flex items-center justify-center pointer-events-none">
          <p className="text-lg font-medium text-primary">Drop images anywhere</p>
        </div>
      )}

      {!hasPhotos && (
        <div className="flex flex-1 flex-col">
          <ImageDropArea onFiles={handleFiles} compact={false} />
          {!historyLoaded && (
            <p className="pb-6 text-center text-xs text-muted-foreground">
              Loading recent work...
            </p>
          )}
        </div>
      )}

      {hasPhotos && (
        <>
          <ImageDropArea onFiles={handleFiles} compact />

          <div className="mx-4 mt-3 flex flex-col gap-2 sm:mx-6 sm:flex-row sm:items-center sm:justify-between">
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
                  {hiddenCount > 0 && ` - showing ${visiblePhotos.length}`}
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

          <div className="flex-1 overflow-y-auto p-4 pt-3 sm:p-6 sm:pt-3">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
              {visiblePhotos.map((photo) => (
                <ImageResultCard
                  key={photo.id}
                  photo={photo}
                  selected={selectedSet.has(photo.id)}
                  onSelect={() => toggleSelect(photo.id)}
                  onRedo={() => handleRedo(photo.id)}
                  onRegenerate={(fb) => handleRegenerate(photo.id, fb)}
                />
              ))}
            </div>
            {hiddenCount > 0 && (
              <div className="flex justify-center pt-5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVisibleCount((count) => count + VISIBLE_RESULTS_STEP)
                  }
                >
                  Load {Math.min(VISIBLE_RESULTS_STEP, hiddenCount)} more
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
