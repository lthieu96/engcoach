"use client";

import { Sliders02 as SlidersIcon } from "@untitledui/icons";
import { Button } from "@/components/ui/button";

/** Opens the AI-provider dialog from anywhere (SettingsDialog listens). */
export function openLlmSettings() {
  window.dispatchEvent(new Event("open-llm-settings"));
}

/** Shown instead of an AI feature until the user configures a provider. */
export function LlmSetupNotice({ feature }: { feature: string }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-xs">
      <span className="flex size-10 items-center justify-center rounded-lg border bg-background shadow-xs">
        <SlidersIcon className="size-5" />
      </span>
      <div className="space-y-1">
        <h2 className="font-semibold">Set up an AI provider</h2>
        <p className="text-sm text-muted-foreground">
          {feature} runs on your own API key — nothing is billed to this app. Gemini and Groq have
          free tiers.
        </p>
      </div>
      <Button onClick={openLlmSettings}>Configure provider</Button>
    </div>
  );
}
