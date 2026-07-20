"use client";

import { useEffect, useState } from "react";

import {
  listTemplates,
  type TemplateInfo,
} from "@/lib/api";

export interface TemplatePickerProps {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onPick: (templateId: string) => void;
  onBlank?: () => void;
}

export function TemplatePicker({
  open,
  busy,
  onClose,
  onPick,
  onBlank,
}: TemplatePickerProps) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listTemplates()
      .then((items) => {
        if (!cancelled) setTemplates(items);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load templates");
        }
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
          <button type="button" className="studio-btn studio-btn--ghost" onClick={onClose}>
            Close
          </button>
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
