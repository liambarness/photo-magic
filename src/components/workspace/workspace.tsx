"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { useAppStore } from "@/stores/use-app-store";
import { usePresetStore } from "@/stores/use-preset-store";
import { ImageDropArea } from "./image-drop-area";
import { ImageResultCard } from "./image-result-card";
import { UploadReviewDialog, type PendingUploadItem } from "./upload-review-dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, CheckSquare, X, Archive, ArchiveRestore, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/use-settings-store";
import { buildFinalPrompt } from "@/lib/final-prompt";
import {
  MAX_UPLOAD_FILES,
  cleanExtension,
  cleanPathSegment,
  formatBytes,
  validateImageFile,
  validateUploadTotal,
} from "@/lib/validation";
import {
  MODEL_PROFILE_AUTO_ID,
  assignModelProfilesToGroups,
  inferViewType,
  productGroupLabel,
} from "@/lib/model-shot";
import type {
  ActivePresetConfig,
  ModelPoseType,
  ModelProfileSelection,
  ModelViewType,
  ModelWearerType,
  PhotoSettings,
  SourcePhoto,
  TouchUpBackground,
  TouchUpStrength,
} from "@/types";

const INITIAL_VISIBLE_RESULTS = 24;
const VISIBLE_RESULTS_STEP = 24;

type StatusFilter = "done" | "all" | Exclude<SourcePhoto["status"], "done">;
type VisibilityFilter = "active" | "archived" | "all";
type SortOrder = "newest" | "oldest";

interface ResolvedUploadItem extends PendingUploadItem {
  settings: PhotoSettings;
  prompt: string;
}

interface UploadedBlobItem {
  id: string;
  name: string;
  blobUrl: string;
  contentType: string;
  size: number;
  settings: PhotoSettings;
}

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

function sourceUploadPath(folder: string, item: ResolvedUploadItem): string {
  const ext = cleanExtension(item.file.name);
  const baseName = item.file.name
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "image";
  const safeFolder = cleanPathSegment(folder, "batch");
  const safeId = cleanPathSegment(item.id, "item");

  return `source-uploads/${safeFolder}/${safeId}/${baseName}.${ext}`;
}

function imageContentType(file: File): string {
  if (file.type) return file.type;

  switch (cleanExtension(file.name)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

async function cleanupUploadedBlobs(items: UploadedBlobItem[]): Promise<void> {
  if (items.length === 0) return;

  await fetch("/api/blob-upload", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobUrls: items.map((item) => item.blobUrl) }),
  }).catch(() => undefined);
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

function revokeLocalPreviews(photos: SourcePhoto[] | PendingUploadItem[]) {
  photos.forEach((photo) => {
    const previewUrl = "previewUrl" in photo ? photo.previewUrl : "";
    if (previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(previewUrl);
    }
  });
}

function normalizeReviewGroupIds(items: PendingUploadItem[]): PendingUploadItem[] {
  const groupIds = Array.from(new Set(items.map((item) => item.productGroupId))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );
  const groupMap = new Map(groupIds.map((groupId, index) => [groupId, String(index + 1)]));

  return items.map((item) => ({
    ...item,
    productGroupId: groupMap.get(item.productGroupId) ?? "1",
  }));
}

function showUploadErrors(errors: string[]) {
  if (errors.length === 0) return;
  if (errors.length === 1) {
    toast.error(errors[0]);
    return;
  }

  const visibleErrors = errors.slice(0, 3);
  const hiddenCount = errors.length - visibleErrors.length;
  toast.error(`${errors.length} upload issues`, {
    description: `${visibleErrors.join("\n")}${hiddenCount > 0 ? `\n+${hiddenCount} more` : ""}`,
  });
}

function normalizeFiles(files: File[], existingItems: PendingUploadItem[] = []): File[] {
  if (files.length === 0) return [];

  const errors: string[] = [];
  const acceptedFiles: File[] = [];

  for (const file of files) {
    const error = validateImageFile(file);
    if (error) {
      errors.push(error);
      continue;
    }
    acceptedFiles.push(file);
  }

  showUploadErrors(errors);
  if (acceptedFiles.length === 0) return [];

  if (existingItems.length + acceptedFiles.length > MAX_UPLOAD_FILES) {
    toast.error(`Review up to ${MAX_UPLOAD_FILES} images at a time.`, {
      description: `${existingItems.length} already staged, ${acceptedFiles.length} selected.`,
    });
    return [];
  }

  const existingBytes = existingItems.reduce((sum, item) => sum + item.file.size, 0);
  const totalUploadError = validateUploadTotal(acceptedFiles, existingBytes);
  if (totalUploadError) {
    toast.error(totalUploadError, {
      description: `Already staged: ${formatBytes(existingBytes)}. Selected: ${formatBytes(acceptedFiles.reduce((sum, file) => sum + file.size, 0))}.`,
    });
    return [];
  }

  return acceptedFiles;
}

function imageReadyKey(photo: SourcePhoto): string {
  return `${photo.id}:${photo.resultUrl ?? ""}:${photo.previewUrl}`;
}

function preloadBrowserImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = url;
    if (image.complete) resolve();
  });
}

async function preloadPhotoImages(photo: SourcePhoto): Promise<void> {
  if (photo.status !== "done" || !photo.resultUrl) return;
  await Promise.all([
    preloadBrowserImage(photo.resultUrl),
    preloadBrowserImage(photo.previewUrl),
  ]);
}

function settingsToActiveConfig(settings: PhotoSettings): ActivePresetConfig {
  return {
    presetId: settings.presetId,
    notes: settings.notes ?? "",
    modelGender: settings.modelGender ?? "varied",
    modelBuild: settings.modelBuild ?? "varied",
    modelWearerType: settings.modelWearerType ?? "mens",
    modelPoseType: settings.modelPoseType ?? "upper_face_visible",
    modelProfileId: settings.modelProfileId ?? MODEL_PROFILE_AUTO_ID,
    touchUpStrength: settings.touchUpStrength ?? "standard",
    touchUpBackground: settings.touchUpBackground ?? "standard_gray",
  };
}

export function Workspace() {
  const photos = useAppStore((s) => s.photos);
  const addPhotos = useAppStore((s) => s.addPhotos);
  const updatePhotoUpload = useAppStore((s) => s.updatePhotoUpload);
  const getActivePrompt = useAppStore((s) => s.getActivePrompt);
  const setPhotoStatus = useAppStore((s) => s.setPhotoStatus);
  const resetSinglePhoto = useAppStore((s) => s.resetSinglePhoto);
  const setPhotoVisibility = useAppStore((s) => s.setPhotoVisibility);
  const removePhotos = useAppStore((s) => s.removePhotos);
  const concurrency = useSettingsStore((s) => s.concurrency);
  const imageSize = useSettingsStore((s) => s.imageSize);
  const imageQuality = useSettingsStore((s) => s.imageQuality);
  const outputFormat = useSettingsStore((s) => s.outputFormat);
  const timeoutMs = useSettingsStore((s) => s.timeoutSeconds) * 1000;
  const selectedIds = useAppStore((s) => s.selectedIds);
  const historyLoaded = useAppStore((s) => s._historyLoaded);
  const activePreset = useAppStore((s) => s.activePreset);
  const activePresetId = useAppStore((s) => s.activePreset.presetId);
  const workspaceResetVersion = useAppStore((s) => s.workspaceResetVersion);
  const statusFilter = useAppStore((s) => s.workspaceStatusFilter);
  const visibilityFilter = useAppStore((s) => s.workspaceVisibilityFilter);
  const sortOrder = useAppStore((s) => s.workspaceSortOrder);
  const visibleCount = useAppStore((s) => s.workspaceVisibleCount);
  const setStatusFilter = useAppStore((s) => s.setWorkspaceStatusFilter);
  const setVisibilityFilter = useAppStore((s) => s.setWorkspaceVisibilityFilter);
  const setSortOrder = useAppStore((s) => s.setWorkspaceSortOrder);
  const setVisibleCount = useAppStore((s) => s.setWorkspaceVisibleCount);
  const presets = usePresetStore((s) => s.presets);
  const activePresetName = usePresetStore((s) =>
    activePresetId ? s.presets.find((p) => p.id === activePresetId)?.name ?? null : null
  );
  const toggleSelect = useAppStore((s) => s.toggleSelect);
  const selectIds = useAppStore((s) => s.selectIds);
  const clearSelection = useAppStore((s) => s.clearSelection);

  const [dragging, setDragging] = useState(false);
  const [reviewItems, setReviewItems] = useState<PendingUploadItem[]>([]);
  const [reviewPresetId, setReviewPresetId] = useState<string | null>(null);
  const [reviewSettings, setReviewSettings] = useState<PhotoSettings | null>(null);
  const [reviewPrompt, setReviewPrompt] = useState("");
  const [reviewAdditionalParameters, setReviewAdditionalParameters] = useState("");
  const [readyImageKeys, setReadyImageKeys] = useState<Set<string>>(() => new Set());
  const [loadingMore, setLoadingMore] = useState(false);
  const preloadingImageKeys = useRef(new Set<string>());
  const resultsScrollRef = useRef<HTMLDivElement>(null);

  const processPhoto = useCallback(
    async (photoId: string, prompt: string, extraFeedback?: string) => {
      setPhotoStatus(photoId, "processing");

      let finalPrompt = prompt;
      if (extraFeedback) {
        finalPrompt += ` IMPORTANT fix requested: ${extraFeedback}.`;
      }

      const photo = useAppStore.getState().photos.find((p) => p.id === photoId);
      const label = photo?.label || "";
      const photoBatchFolder = photo?.batchFolder || batchFolder();
      const sourceUrl = photo?.serverPath || photo?.previewUrl || "";

      try {
        const res = await fetch("/api/touch-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folder: photoBatchFolder,
            photoId,
            label,
            sourceUrl,
            prompt: finalPrompt,
            imageSize,
            imageQuality,
            outputFormat,
          }),
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
    [setPhotoStatus, imageSize, imageQuality, outputFormat, timeoutMs]
  );

  const uploadAndProcess = useCallback(
    async (items: ResolvedUploadItem[], settings: PhotoSettings) => {
      const folder = batchFolder();
      const now = Date.now();
      useAppStore.setState({ workspaceStatusFilter: "all" });
      setVisibleCount(INITIAL_VISIBLE_RESULTS);

      const newPhotos: SourcePhoto[] = items.map((item) => ({
        id: item.id,
        name: item.file.name,
        label: "",
        batchFolder: folder,
        previewUrl: item.previewUrl,
        serverPath: null,
        status: "pending" as const,
        resultUrl: null,
        error: null,
        usedSettings: item.settings,
        visibility: "active",
        cost: 0,
        usage: null,
        createdAt: now,
        updatedAt: now,
      }));

      addPhotos(newPhotos);

      const uploadResults = await runPool(
        items.map((item) => async () => {
          try {
            const contentType = imageContentType(item.file);
            const blob = await upload(sourceUploadPath(folder, item), item.file, {
              access: "private",
              handleUploadUrl: "/api/blob-upload",
              contentType,
              multipart: item.file.size > 25 * 1024 * 1024,
              clientPayload: JSON.stringify({ id: item.id, name: item.file.name }),
            });

            return {
              ok: true as const,
              uploaded: {
                id: item.id,
                name: item.file.name,
                blobUrl: blob.url,
                contentType,
                size: item.file.size,
                settings: item.settings,
              } satisfies UploadedBlobItem,
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : "Source upload failed";
            setPhotoStatus(item.id, "error", null, message);
            return { ok: false as const, id: item.id };
          }
        }),
        Math.min(concurrency, 4)
      );

      const uploadedItems = uploadResults
        .filter((result): result is Extract<(typeof uploadResults)[number], { ok: true }> => result.ok)
        .map((result) => result.uploaded);

      if (uploadedItems.length === 0) {
        toast.error("Upload failed", { id: "upload-failed" });
        return;
      }

      try {
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folder,
            product: settings.presetName,
            shotType: settings.shotMode,
            settings,
            items: uploadedItems,
          }),
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => null);
          const message = typeof err?.error === "string" ? err.error : "Upload failed";
          await cleanupUploadedBlobs(uploadedItems);
          uploadedItems.forEach((item) => setPhotoStatus(item.id, "error", null, message));
          toast.error("Upload failed", { id: "upload-failed" });
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

        const successfulUploadIds = new Set(uploadedItems.map((item) => item.id));
        const missingUploads = newPhotos.filter((p) => successfulUploadIds.has(p.id) && !uploadedIds.has(p.id));
        await cleanupUploadedBlobs(uploadedItems.filter((item) => !uploadedIds.has(item.id)));
        missingUploads.forEach((p) => setPhotoStatus(p.id, "error", null, "Upload did not return a source image"));
      } catch {
        await cleanupUploadedBlobs(uploadedItems);
        uploadedItems.forEach((item) => setPhotoStatus(item.id, "error", null, "Upload failed"));
        toast.error("Upload failed", { id: "upload-failed" });
        return;
      }

      const uploadedPhotos = useAppStore
        .getState()
        .photos.filter((p) => newPhotos.some((photo) => photo.id === p.id && p.serverPath));

      if (uploadedPhotos.length === 0) return;

      await runPool(
        uploadedPhotos.map((p) => () =>
          processPhoto(p.id, p.usedSettings.finalPrompt ?? items.find((item) => item.id === p.id)?.prompt ?? "")
        ),
        concurrency
      );
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
    [addPhotos, updatePhotoUpload, processPhoto, concurrency, setPhotoStatus, setVisibleCount]
  );

  const buildReviewSettingsForPreset = useCallback(
    (presetId: string, additionalParameters?: string): { settings: PhotoSettings; prompt: string } | null => {
      const preset = presets.find((p) => p.id === presetId);
      if (!preset) return null;

      const baseConfig =
        activePreset.presetId === presetId
          ? activePreset
          : {
              presetId,
              notes: "",
              modelGender: "varied",
              modelBuild: "varied",
              modelWearerType: "mens" as ModelWearerType,
              modelPoseType: "upper_face_visible" as ModelPoseType,
              modelProfileId: MODEL_PROFILE_AUTO_ID as ModelProfileSelection,
              touchUpStrength: "standard" as TouchUpStrength,
              touchUpBackground: "standard_gray" as TouchUpBackground,
            };
      const config = {
        ...baseConfig,
        notes: additionalParameters ?? baseConfig.notes,
      };
      const prompt = buildFinalPrompt(preset, config);
      if (!prompt) return null;

      const notes = config.notes.trim();
      return {
        prompt,
        settings: {
          presetId,
          presetName: preset.name,
          shotMode: preset.shotMode,
          modelGender: preset.shotMode === "model" ? config.modelGender || "varied" : undefined,
          modelBuild: preset.shotMode === "model" ? config.modelBuild || "varied" : undefined,
          modelWearerType: preset.shotMode === "model" ? config.modelWearerType : undefined,
          modelPoseType: preset.shotMode === "model" ? config.modelPoseType : undefined,
          modelProfileId: preset.shotMode === "model" ? config.modelProfileId : undefined,
          touchUpStrength: preset.shotMode === "touchup" ? config.touchUpStrength : undefined,
          touchUpBackground: preset.shotMode === "touchup" ? config.touchUpBackground : undefined,
          notes: notes || undefined,
          finalPrompt: prompt,
        },
      };
    },
    [activePreset, presets]
  );

  const handleReviewPresetChange = useCallback(
    (presetId: string) => {
      const next = buildReviewSettingsForPreset(presetId, reviewAdditionalParameters);
      setReviewPresetId(presetId);
      if (!next) {
        setReviewSettings(null);
        setReviewPrompt("");
        toast.error("That preset needs to be saved again before it can process images.");
        return;
      }

      setReviewSettings(next.settings);
      setReviewPrompt(next.prompt);
    },
    [buildReviewSettingsForPreset, reviewAdditionalParameters]
  );

  const handleReviewAdditionalParametersChange = useCallback(
    (value: string) => {
      setReviewAdditionalParameters(value);
      if (!reviewPresetId) return;

      const next = buildReviewSettingsForPreset(reviewPresetId, value);
      if (!next) {
        setReviewSettings(null);
        setReviewPrompt("");
        return;
      }

      setReviewSettings(next.settings);
      setReviewPrompt(next.prompt);
    },
    [buildReviewSettingsForPreset, reviewPresetId]
  );

  const stageFiles = useCallback(
    (files: File[]) => {
      const imageFiles = normalizeFiles(files, reviewItems);
      if (imageFiles.length === 0) {
        return;
      }

      const activeReviewPresetId = reviewPresetId ?? activePresetId;
      const additionalParameters =
        reviewItems.length > 0
          ? reviewAdditionalParameters
          : activeReviewPresetId === activePresetId
            ? activePreset.notes
            : "";
      const reviewPreset = activeReviewPresetId
        ? buildReviewSettingsForPreset(activeReviewPresetId, additionalParameters)
        : null;
      const prompt = reviewPrompt || reviewPreset?.prompt || "";
      const settings = reviewSettings ?? reviewPreset?.settings ?? null;
      const existingCount = reviewItems.length;

      const nextItems = imageFiles.map((file, index) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        productGroupId: String(existingCount + index + 1),
        viewType: inferViewType(file.name),
      }));

      setReviewPresetId(activeReviewPresetId ?? null);
      setReviewAdditionalParameters(additionalParameters);
      setReviewPrompt(prompt);
      setReviewSettings(settings);
      setReviewItems((current) => [...current, ...nextItems]);
    },
    [
      activePresetId,
      activePreset.notes,
      buildReviewSettingsForPreset,
      reviewItems,
      reviewAdditionalParameters,
      reviewPresetId,
      reviewPrompt,
      reviewSettings,
    ]
  );

  const cancelReview = useCallback(() => {
    revokeLocalPreviews(reviewItems);
    setReviewItems([]);
    setReviewPresetId(null);
    setReviewSettings(null);
    setReviewPrompt("");
    setReviewAdditionalParameters("");
  }, [reviewItems]);

  const removeReviewItem = useCallback(
    (itemId: string) => {
      const item = reviewItems.find((reviewItem) => reviewItem.id === itemId);
      if (!item) return;

      revokeLocalPreviews([item]);
      const nextItems = normalizeReviewGroupIds(
        reviewItems.filter((reviewItem) => reviewItem.id !== itemId)
      );
      setReviewItems(nextItems);

      if (nextItems.length === 0) {
        setReviewPresetId(null);
        setReviewSettings(null);
        setReviewPrompt("");
        setReviewAdditionalParameters("");
      }
    },
    [reviewItems]
  );

  const updateReviewItemGroup = useCallback((itemId: string, productGroupId: string) => {
    setReviewItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, productGroupId } : item
      )
    );
  }, []);

  const updateReviewItemViewType = useCallback((itemId: string, viewType: ModelViewType) => {
    setReviewItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, viewType } : item))
    );
  }, []);

  const applyReviewGrouping = useCallback((strategy: "unique" | "pairs" | "single") => {
    setReviewItems((current) =>
      current.map((item, index) => {
        if (strategy === "single") return { ...item, productGroupId: "1" };
        if (strategy === "pairs") return { ...item, productGroupId: String(Math.floor(index / 2) + 1) };
        return { ...item, productGroupId: String(index + 1) };
      })
    );
  }, []);

  const resolveReviewItems = useCallback((): ResolvedUploadItem[] | null => {
    if (!reviewSettings || !reviewPresetId || reviewItems.length === 0) return null;

    const preset = presets.find((p) => p.id === reviewPresetId);
    if (!preset) return null;

    if (reviewSettings.shotMode !== "model") {
      return reviewItems.map((item) => ({
        ...item,
        prompt: reviewPrompt,
        settings: {
          ...reviewSettings,
          finalPrompt: reviewPrompt,
        },
      }));
    }

    const groupIds = Array.from(new Set(reviewItems.map((item) => item.productGroupId)));
    const wearerType = reviewSettings.modelWearerType ?? "mens";
    const assignments = assignModelProfilesToGroups(
      groupIds,
      wearerType,
      reviewSettings.modelProfileId ?? MODEL_PROFILE_AUTO_ID
    );

    return reviewItems.map((item) => {
      const profile = assignments[item.productGroupId];
      const itemSettings: PhotoSettings = {
        ...reviewSettings,
        modelProfileId: profile.id,
        modelProfileName: profile.name,
        productGroupId: item.productGroupId,
        productGroupLabel: productGroupLabel(item.productGroupId),
        viewType: item.viewType,
      };
      const itemPrompt =
        buildFinalPrompt(preset, settingsToActiveConfig(itemSettings), {
          modelProfileId: profile.id,
          productGroupId: item.productGroupId,
          productGroupLabel: itemSettings.productGroupLabel,
          viewType: item.viewType,
        }) ?? reviewPrompt;

      return {
        ...item,
        prompt: itemPrompt,
        settings: {
          ...itemSettings,
          finalPrompt: itemPrompt,
        },
      };
    });
  }, [presets, reviewItems, reviewPresetId, reviewPrompt, reviewSettings]);

  const approveReview = useCallback(() => {
    if (!reviewSettings || !reviewPrompt || !reviewPresetId || reviewItems.length === 0) {
      toast.error("Choose a preset before approving.");
      return;
    }
    const items = resolveReviewItems();
    if (!items) {
      toast.error("Upload settings could not be resolved.");
      return;
    }
    const settings = reviewSettings;

    setReviewItems([]);
    setReviewPresetId(null);
    setReviewSettings(null);
    setReviewPrompt("");
    setReviewAdditionalParameters("");
    void uploadAndProcess(items, settings);
  }, [reviewItems.length, reviewPresetId, reviewPrompt, reviewSettings, resolveReviewItems, uploadAndProcess]);

  const handleRedo = useCallback(
    async (photoId: string) => {
      const photo = useAppStore.getState().photos.find((p) => p.id === photoId);
      const prompt = photo?.usedSettings.finalPrompt || getActivePrompt();
      if (!prompt) {
        toast.error("No prompt available. Select a preset first.", { id: "no-prompt" });
        return;
      }
      resetSinglePhoto(photoId);
      await processPhoto(photoId, prompt);
      const updatedPhoto = useAppStore.getState().photos.find((p) => p.id === photoId);
      try {
        if (updatedPhoto) await saveHistory([updatedPhoto]);
      } catch {
        toast.error("Redo finished, but history did not update.");
      }
    },
    [resetSinglePhoto, processPhoto, getActivePrompt]
  );

  const handleRegenerate = useCallback(
    async (photoId: string, feedback: string) => {
      const photo = useAppStore.getState().photos.find((p) => p.id === photoId);
      const prompt = photo?.usedSettings.finalPrompt || getActivePrompt();
      if (!prompt) {
        toast.error("No prompt available. Select a preset first.", { id: "no-prompt" });
        return;
      }
      resetSinglePhoto(photoId);
      await processPhoto(photoId, prompt, feedback);
      const updatedPhoto = useAppStore.getState().photos.find((p) => p.id === photoId);
      try {
        if (updatedPhoto) await saveHistory([updatedPhoto]);
      } catch {
        toast.error("Regenerate finished, but history did not update.");
      }
    },
    [resetSinglePhoto, processPhoto, getActivePrompt]
  );

  const filteredPhotos = useMemo(() => {
    const matchesPreset = (photo: SourcePhoto) => {
      if (!activePresetId) return true;
      if (photo.usedSettings.presetId === activePresetId) return true;
      return Boolean(
        !photo.usedSettings.presetId &&
          activePresetName &&
          photo.usedSettings.presetName === activePresetName
      );
    };

    return photos
      .filter((photo) => matchesPreset(photo))
      .filter((photo) => {
        if (visibilityFilter === "all") return true;
        return photo.visibility === visibilityFilter;
      })
      .filter((photo) => statusFilter === "all" || photo.status === statusFilter)
      .sort((a, b) => {
        const aTime = a.updatedAt ?? a.createdAt ?? 0;
        const bTime = b.updatedAt ?? b.createdAt ?? 0;
        return sortOrder === "newest" ? bTime - aTime : aTime - bTime;
      });
  }, [photos, activePresetId, activePresetName, visibilityFilter, statusFilter, sortOrder]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) return;

      e.preventDefault();
      stageFiles(images);
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [stageFiles]);

  const visiblePhotos = useMemo(
    () => filteredPhotos.slice(0, visibleCount),
    [filteredPhotos, visibleCount]
  );

  useEffect(() => {
    for (const photo of visiblePhotos) {
      if (photo.status !== "done" || !photo.resultUrl) continue;

      const key = imageReadyKey(photo);
      if (readyImageKeys.has(key) || preloadingImageKeys.current.has(key)) continue;

      preloadingImageKeys.current.add(key);
      void preloadPhotoImages(photo).then(() => {
        preloadingImageKeys.current.delete(key);
        setReadyImageKeys((current) => {
          if (current.has(key)) return current;
          const next = new Set(current);
          next.add(key);
          return next;
        });
      }).catch(() => {
        preloadingImageKeys.current.delete(key);
      });
    }
  }, [readyImageKeys, visiblePhotos]);

  const visiblePhotoIds = useMemo(() => new Set(filteredPhotos.map((p) => p.id)), [filteredPhotos]);
  const visibleSelectedIds = useMemo(
    () => selectedIds.filter((id) => visiblePhotoIds.has(id)),
    [selectedIds, visiblePhotoIds]
  );
  const selectedSet = useMemo(() => new Set(visibleSelectedIds), [visibleSelectedIds]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;

    const nextPhotos = filteredPhotos.slice(visibleCount, visibleCount + VISIBLE_RESULTS_STEP);
    if (nextPhotos.length === 0) return;

    setLoadingMore(true);
    try {
      const readyKeys: string[] = [];
      await Promise.all(
        nextPhotos.map(async (photo) => {
          if (photo.status !== "done" || !photo.resultUrl) return;
          await preloadPhotoImages(photo);
          readyKeys.push(imageReadyKey(photo));
        })
      );

      if (readyKeys.length > 0) {
        setReadyImageKeys((current) => {
          const next = new Set(current);
          readyKeys.forEach((key) => next.add(key));
          return next;
        });
      }

      setVisibleCount((count) =>
        Math.min(count + VISIBLE_RESULTS_STEP, filteredPhotos.length)
      );
    } finally {
      setLoadingMore(false);
    }
  }, [filteredPhotos, loadingMore, setVisibleCount, visibleCount]);

  useEffect(() => {
    resultsScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [workspaceResetVersion]);

  const handleExport = useCallback(async () => {
    const selectedVisible = new Set(visibleSelectedIds);
    const toExport = filteredPhotos.filter(
      (p) => selectedVisible.has(p.id) && p.status === "done" && p.resultUrl
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
  }, [filteredPhotos, visibleSelectedIds, clearSelection]);

  const handleSetVisibility = useCallback(
    async (ids: string[], visibility: SourcePhoto["visibility"]) => {
      if (ids.length === 0) return;
      try {
        const res = await fetch("/api/history", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "visibility", ids, visibility }),
        });
        if (!res.ok) throw new Error("Visibility update failed");
        setPhotoVisibility(ids, visibility);
        toast.success(
          visibility === "archived"
            ? `${ids.length} image${ids.length > 1 ? "s" : ""} archived`
            : `${ids.length} image${ids.length > 1 ? "s" : ""} restored`
        );
      } catch {
        toast.error("Image visibility could not be updated.");
      }
    },
    [setPhotoVisibility]
  );

  const handleDeletePhotos = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const confirmed = window.confirm(
        `Permanently delete ${ids.length} image${ids.length > 1 ? "s" : ""} and stored files? This cannot be undone.`
      );
      if (!confirmed) return;

      const deletedPhotos = useAppStore.getState().photos.filter((photo) => ids.includes(photo.id));
      try {
        const res = await fetch("/api/history", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) throw new Error("Delete failed");
        revokeLocalPreviews(deletedPhotos);
        removePhotos(ids);
        toast.success(`${ids.length} image${ids.length > 1 ? "s" : ""} deleted`);
      } catch {
        toast.error("Images could not be deleted.");
      }
    },
    [removePhotos]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) stageFiles(files);
    },
    [stageFiles]
  );

  const hasPhotos = photos.length > 0;
  const doneCount = filteredPhotos.filter((p) => p.status === "done").length;
  const selectedCount = visibleSelectedIds.length;
  const costPhotos =
    selectedCount > 0
      ? filteredPhotos.filter((photo) => selectedSet.has(photo.id))
      : filteredPhotos;
  const totalCost = costPhotos.reduce((sum, p) => sum + p.cost, 0);
  const hiddenCount = Math.max(0, filteredPhotos.length - visiblePhotos.length);
  const activeFilterLabel = activePresetName ?? "all products";
  const statusFilterLabel =
    statusFilter === "all" ? "All status" : statusFilter === "done" ? "Completed" : statusFilter.slice(0, 1).toUpperCase() + statusFilter.slice(1);
  const visibilityFilterLabel =
    visibilityFilter === "all" ? "All" : visibilityFilter.slice(0, 1).toUpperCase() + visibilityFilter.slice(1);
  const sortOrderLabel = sortOrder === "newest" ? "Newest" : "Oldest";

  return (
    <div
      className="relative flex flex-1 flex-col overflow-hidden"
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
        <div className="pointer-events-none absolute inset-0 z-50 m-2 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
          <p className="text-lg font-medium text-primary">Drop images to review</p>
        </div>
      )}

      {!hasPhotos && (
        <div className="flex flex-1 flex-col">
          <ImageDropArea onFiles={stageFiles} compact={false} />
          {!historyLoaded && (
            <p className="pb-6 text-center text-xs text-muted-foreground">
              Loading recent work...
            </p>
          )}
        </div>
      )}

      {hasPhotos && (
        <>
          <div className="shrink-0 border-b bg-background/95 px-4 py-3 sm:px-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                {selectedCount > 0
                  ? `${selectedCount} selected`
                  : `${filteredPhotos.length} result${filteredPhotos.length !== 1 ? "s" : ""} for ${activeFilterLabel}${hiddenCount > 0 ? ` - showing ${visiblePhotos.length}` : ""}`}
                {totalCost > 0 && (
                  <span className="text-muted-foreground/60">
                    {" "}
                    - ${totalCost.toFixed(3)}
                  </span>
                )}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value as StatusFilter);
                    setVisibleCount(INITIAL_VISIBLE_RESULTS);
                  }}
                >
                  <SelectTrigger className="h-8 w-[120px] text-xs">
                    <SelectValue>{statusFilterLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false} side="bottom" sideOffset={6}>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="done">Completed</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="pending">Queued</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={visibilityFilter}
                  onValueChange={(value) => {
                    setVisibilityFilter(value as VisibilityFilter);
                    setVisibleCount(INITIAL_VISIBLE_RESULTS);
                  }}
                >
                  <SelectTrigger className="h-8 w-[112px] text-xs">
                    <SelectValue>{visibilityFilterLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false} side="bottom" sideOffset={6}>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={sortOrder}
                  onValueChange={(value) => {
                    setSortOrder(value as SortOrder);
                    setVisibleCount(INITIAL_VISIBLE_RESULTS);
                  }}
                >
                  <SelectTrigger className="h-8 w-[104px] text-xs">
                    <SelectValue>{sortOrderLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent align="start" alignItemWithTrigger={false} side="bottom" sideOffset={6}>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                  </SelectContent>
                </Select>
                {selectedCount > 0 && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={clearSelection}
                    >
                      <X className="mr-1 h-3 w-3" />
                      Clear
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() =>
                        handleSetVisibility(
                          visibleSelectedIds,
                          visibilityFilter === "archived" ? "active" : "archived"
                        )
                      }
                    >
                      {visibilityFilter === "archived" ? (
                        <ArchiveRestore className="mr-1 h-3 w-3" />
                      ) : (
                        <Archive className="mr-1 h-3 w-3" />
                      )}
                      {visibilityFilter === "archived" ? "Restore" : "Archive"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:text-destructive"
                      onClick={() => handleDeletePhotos(visibleSelectedIds)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Delete
                    </Button>
                  </>
                )}
                {doneCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() =>
                      selectIds(visiblePhotos.filter((p) => p.status === "done").map((p) => p.id))
                    }
                  >
                    <CheckSquare className="mr-1 h-3 w-3" />
                    Select Visible
                  </Button>
                )}
                {selectedCount > 0 && (
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleExport}
                  >
                    <Download className="mr-1 h-3 w-3" />
                    Export ({selectedCount})
                  </Button>
                )}
              </div>
            </div>
          </div>

          <div
            ref={resultsScrollRef}
            className="flex-1 overflow-y-auto p-4 pb-24 pt-4 sm:p-6 sm:pb-24 sm:pt-4"
          >
            {filteredPhotos.length === 0 ? (
              <div className="flex min-h-60 flex-col items-center justify-center gap-3 text-center">
                <p className="text-sm font-medium">No images match these filters</p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  The grid follows the preset dropdown and active image filters.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))] gap-4">
                  {visiblePhotos.map((photo) => (
                    <ImageResultCard
                      key={photo.id}
                      photo={photo}
                      selected={selectedSet.has(photo.id)}
                      imageReady={
                        photo.status !== "done" ||
                        !photo.resultUrl ||
                        readyImageKeys.has(imageReadyKey(photo))
                      }
                      onSelect={() => toggleSelect(photo.id)}
                      onRedo={() => handleRedo(photo.id)}
                      onRegenerate={(fb) => handleRegenerate(photo.id, fb)}
                      onArchive={() => handleSetVisibility([photo.id], "archived")}
                      onRestore={() => handleSetVisibility([photo.id], "active")}
                      onDelete={() => handleDeletePhotos([photo.id])}
                    />
                  ))}
                </div>
                {hiddenCount > 0 && (
                  <div className="flex justify-center pt-5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleLoadMore()}
                      disabled={loadingMore}
                    >
                      {loadingMore && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      {loadingMore
                        ? "Loading next images..."
                        : `Load ${Math.min(VISIBLE_RESULTS_STEP, hiddenCount)} more`}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4 sm:bottom-5">
            <ImageDropArea onFiles={stageFiles} compact />
          </div>
        </>
      )}

      <UploadReviewDialog
        open={reviewItems.length > 0}
        items={reviewItems}
        settings={reviewSettings}
        prompt={reviewPrompt}
        processingSettings={{ imageSize, imageQuality, outputFormat, concurrency }}
        presets={presets}
        selectedPresetId={reviewPresetId}
        additionalParameters={reviewAdditionalParameters}
        onPresetChange={handleReviewPresetChange}
        onAdditionalParametersChange={handleReviewAdditionalParametersChange}
        onProductGroupChange={updateReviewItemGroup}
        onViewTypeChange={updateReviewItemViewType}
        onApplyGrouping={applyReviewGrouping}
        onAddFiles={stageFiles}
        onRemoveItem={removeReviewItem}
        onApprove={approveReview}
        onCancel={cancelReview}
      />
    </div>
  );
}
