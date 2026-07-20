"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";

import {
  absoluteApiUrl,
  generateArtifact,
  type ArtifactConfigInput,
  type GenerateArtifactResult,
} from "@/lib/api";

export interface PreviewArtifactPanelProps {
  workflowId: string | null;
  busy: boolean;
  onBeforeGenerate?: () => Promise<void>;
}

export function PreviewArtifactPanel({
  workflowId,
  busy,
  onBeforeGenerate,
}: PreviewArtifactPanelProps) {
  const [config, setConfig] = useState<ArtifactConfigInput>({
    business_name: "My Business",
    product_name: "Product",
    price_ngn: 5000,
    accent_color: "#0f6b57",
    tagline: "Pay securely. Every order is verified with Monnify.",
    logo_url: "",
  });
  const [logoUrlField, setLogoUrlField] = useState("");
  const [result, setResult] = useState<GenerateArtifactResult | null>(null);
  const [view, setView] = useState<"payment" | "dashboard">("payment");
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  function onLogoFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      setConfig((current) => ({ ...current, logo_url: dataUrl }));
      setLogoUrlField("");
    };
    reader.readAsDataURL(file);
  }

  async function onGenerate(event: FormEvent) {
    event.preventDefault();
    if (!workflowId) return;
    setGenerating(true);
    setError(null);
    try {
      await onBeforeGenerate?.();
      const payload: ArtifactConfigInput = {
        ...config,
        logo_url: config.logo_url || logoUrlField || undefined,
        price_ngn: Number(config.price_ngn) || 5000,
      };
      const next = await generateArtifact(workflowId, payload);
      setResult(next);
      setView("payment");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  }

  const iframeSrc = result
    ? absoluteApiUrl(
        view === "dashboard" ? result.dashboard_url : result.preview_url,
      )
    : null;

  return (
    <div className="studio-artifact">
      <h3>Seller preview</h3>
      <p className="muted">
        Generate the payment page + orders dashboard for this workflow.
      </p>
      {!workflowId && <p className="muted">Open a workflow first.</p>}
      <form className="studio-artifact__form" onSubmit={onGenerate}>
        <label>
          Business name
          <input
            value={config.business_name ?? ""}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                business_name: event.target.value,
              }))
            }
            disabled={busy || generating || !workflowId}
          />
        </label>
        <label>
          Product
          <input
            value={config.product_name ?? ""}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                product_name: event.target.value,
              }))
            }
            disabled={busy || generating || !workflowId}
          />
        </label>
        <label>
          Price (NGN)
          <input
            type="number"
            min={100}
            value={config.price_ngn ?? 5000}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                price_ngn: Number(event.target.value),
              }))
            }
            disabled={busy || generating || !workflowId}
          />
        </label>
        <label>
          Accent color
          <input
            type="color"
            value={config.accent_color ?? "#0f6b57"}
            onChange={(event) =>
              setConfig((current) => ({
                ...current,
                accent_color: event.target.value,
              }))
            }
            disabled={busy || generating || !workflowId}
          />
        </label>
        <label>
          Logo file
          <input
            type="file"
            accept="image/*"
            onChange={onLogoFile}
            disabled={busy || generating || !workflowId}
          />
        </label>
        <label>
          Logo URL (optional)
          <input
            value={logoUrlField}
            placeholder="https://…"
            onChange={(event) => {
              setLogoUrlField(event.target.value);
              setConfig((current) => ({
                ...current,
                logo_url: event.target.value,
              }));
            }}
            disabled={busy || generating || !workflowId}
          />
        </label>
        <button
          type="submit"
          className="studio-btn studio-btn--primary"
          disabled={busy || generating || !workflowId}
        >
          {generating ? "Generating…" : "Generate preview"}
        </button>
      </form>
      {error && <p className="studio-artifact__error">{error}</p>}
      {result && (
        <>
          <div className="studio-segment studio-segment--compact">
            <button
              type="button"
              className={view === "payment" ? "is-active" : ""}
              onClick={() => setView("payment")}
            >
              Payment page
            </button>
            <button
              type="button"
              className={view === "dashboard" ? "is-active" : ""}
              onClick={() => setView("dashboard")}
            >
              Orders
            </button>
          </div>
          <iframe
            className="studio-artifact__frame"
            title="Seller artifact preview"
            src={iframeSrc ?? undefined}
          />
        </>
      )}
    </div>
  );
}
