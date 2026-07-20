"use client";

import { useEffect, useState } from "react";

import { listTemplates, type TemplateInfo } from "@/lib/api";

export interface TemplatePickerProps {
  open: boolean;
  busy: boolean;
  dismissible?: boolean;
  onClose: () => void;
  onPick: (templateId: string) => void;
  onBlank?: () => void;
}

const CANNED: TemplateInfo[] = [
  {
    id: "sell-online",
    title: "Sell online with verified payments",
    persona: "Small online seller",
    description:
      "Checkout link + orders dashboard. Paid only after Monnify verifies.",
  },
  {
    id: "payroll",
    title: "Payroll",
    persona: "Team lead / ops",
    description: "Bulk payouts with verification and reconciliation guards.",
  },
];

export function TemplatePicker({
  open,
  busy,
  dismissible = true,
  onClose,
  onPick,
  onBlank,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<TemplateInfo[]>(CANNED);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listTemplates()
      .then((items) => {
        if (cancelled) return;
        setTemplates(items.length > 0 ? items : CANNED);
        setError(items.length > 0 ? null : "Using offline template list.");
      })
      .catch((err) => {
        if (cancelled) return;
        setTemplates(CANNED);
        setError(
          err instanceof Error
            ? `${err.message} — showing offline templates.`
            : "Showing offline templates.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="studio-modal" role="dialog" aria-label="What do you want to set up?">
      <div className="studio-modal__card">
        <div className="studio-modal__head">
          <div>
            <h2>What do you want to set up?</h2>
            <p>Pick a vetted product template. Safety nodes come built in.</p>
          </div>
          {dismissible && (
            <button type="button" className="studio-btn studio-btn--ghost" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        {error && <p className="studio-modal__error">{error}</p>}
        <div className="studio-template-grid">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              className="studio-template-card"
              disabled={busy}
              onClick={() => onPick(template.id)}
            >
              <strong>{template.title}</strong>
              <span className="studio-template-card__persona">{template.persona}</span>
              <span className="studio-template-card__desc">{template.description}</span>
            </button>
          ))}
        </div>
        {onBlank && (
          <button
            type="button"
            className="studio-btn studio-btn--ghost studio-modal__blank"
            disabled={busy}
            onClick={onBlank}
          >
            Start from blank canvas
          </button>
        )}
      </div>
    </div>
  );
}
