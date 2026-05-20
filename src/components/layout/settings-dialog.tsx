"use client";

import { useSettingsStore } from "@/stores/use-settings-store";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Settings, RotateCcw } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-medium text-foreground">{children}</label>;
}

export function SettingsDialog() {
  const settings = useSettingsStore();

  return (
    <Dialog>
      <DialogTrigger className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer">
        <span className="sr-only">Open settings</span>
        <Settings className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-6">
        <DialogHeader>
          <DialogTitle className="text-lg">Settings</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Persisted on this device across sessions.
          </p>
        </DialogHeader>

        <div className="space-y-8 mt-2">
          {/* ── Global Prompt Context ── */}
          <section className="space-y-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Global Prompt Context
            </h3>

            <div className="space-y-2">
              <FieldLabel>Background Description</FieldLabel>
              <Textarea
                value={settings.background}
                onChange={(e) => settings.updateSettings({ background: e.target.value })}
                className="text-sm min-h-24 resize-y"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Included in every generated prompt to describe the studio setup.
              </p>
            </div>

            <div className="space-y-2">
              <FieldLabel>Brand Rules</FieldLabel>
              <Textarea
                value={settings.brandRules}
                onChange={(e) => settings.updateSettings({ brandRules: e.target.value })}
                className="text-sm min-h-32 resize-y"
              />
              <p className="text-[11px] text-muted-foreground/60">
                Appended to every prompt. Use for rules that should always apply.
              </p>
            </div>
          </section>

          <Separator />

          {/* ── Processing ── */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Processing
            </h3>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <div className="space-y-1.5">
                <FieldLabel>Quality</FieldLabel>
                <Select
                  value={settings.imageQuality}
                  onValueChange={(v) => v && settings.updateSettings({ imageQuality: v })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="auto">Auto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Format</FieldLabel>
                <Select
                  value={settings.outputFormat}
                  onValueChange={(v) => v && settings.updateSettings({ outputFormat: v })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="webp">WebP</SelectItem>
                    <SelectItem value="jpeg">JPEG</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Size</FieldLabel>
                <Select
                  value={settings.imageSize}
                  onValueChange={(v) => v && settings.updateSettings({ imageSize: v })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1024x1024">1024 x 1024</SelectItem>
                    <SelectItem value="1536x1024">1536 x 1024</SelectItem>
                    <SelectItem value="1024x1536">1024 x 1536</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Parallel</FieldLabel>
                <Select
                  value={String(settings.concurrency)}
                  onValueChange={(v) => v && settings.updateSettings({ concurrency: Number(v) })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 6, 8].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Timeout</FieldLabel>
                <Select
                  value={String(settings.timeoutSeconds)}
                  onValueChange={(v) => v && settings.updateSettings({ timeoutSeconds: Number(v) })}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[120, 180, 300, 600].map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}s</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <Separator />

          <Button
            variant="outline"
            size="sm"
            onClick={() => settings.resetSettings()}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-2" />
            Reset All to Defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
