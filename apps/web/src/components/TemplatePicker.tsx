/**
 * One template picker for the whole app (business setup, dashboard New, rail +).
 * Figma jj9fKZamdwfNDVD5rGQI9G — Template selection #144:4304 / #155:4959:
 * "What do you want to do?" + four cards + Select + Back.
 */
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  TEMPLATE_PICKER_BACK_LABEL,
  TEMPLATE_PICKER_OPTIONS,
  TEMPLATE_PICKER_SELECT_BUSY_LABEL,
  TEMPLATE_PICKER_SELECT_LABEL,
  TEMPLATE_PICKER_SUBTITLE,
  TEMPLATE_PICKER_TITLE,
  type TemplatePickerOption,
} from "@/lib/templatePickerOptions";

export interface TemplatePickerProps {
  open: boolean;
  busy: boolean;
  dismissible?: boolean;
  /** Render inside onboarding chrome instead of a full-screen modal. */
  embedded?: boolean;
  /** @deprecated Kept for call-site compat; ignored — one card set everywhere. */
  variant?: "default" | "business-onboarding";
  onClose: () => void;
  onPick: (templateId: string) => void;
  onBlank?: () => void;
  /** "Something else": hands off to Moni instead of a template. */
  onOther?: () => void;
  onBack?: () => void;
}

export function TemplatePicker({
  open,
  busy,
  embedded = false,
  onPick,
  onBlank,
  onOther,
  onBack,
  onClose,
}: TemplatePickerProps) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  if (!open) return null;

  function confirm(option: TemplatePickerOption) {
    if (busy) return;
    if (option.kind === "other") {
      (onOther ?? onBlank)?.();
      return;
    }
    onPick(option.id);
  }

  function handleBack() {
    if (busy) return;
    if (onBack) onBack();
    else onClose();
  }

  const body = (
    <div className="studio-template-picker">
      <header className="studio-template-picker__header is-centered">
        <h2>{TEMPLATE_PICKER_TITLE}</h2>
        <p>{TEMPLATE_PICKER_SUBTITLE}</p>
      </header>

      <div
        className="studio-template-picker__grid"
        role="radiogroup"
        aria-label="Templates"
      >
        {TEMPLATE_PICKER_OPTIONS.map((option) => {
          const isSelected = selected === option.id;
          const isPlusThumb = option.kind === "other";
          return (
            <div
              key={option.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              className={`studio-template-picker__card${isSelected ? " is-selected" : ""}`}
              onClick={() => {
                if (!busy) setSelected(option.id);
              }}
              onKeyDown={(event) => {
                if (busy) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelected(option.id);
                }
              }}
            >
              <div
                className={`studio-template-picker__thumb${isSelected ? " is-selected" : ""}${
                  isPlusThumb ? " is-blank" : ""
                }`}
              >
                {option.image ? (
                  <Image
                    src={option.image}
                    alt=""
                    width={378}
                    height={316}
                    unoptimized
                  />
                ) : (
                  <span className="studio-template-picker__placeholder" aria-hidden>
                    +
                  </span>
                )}
                {isSelected ? (
                  <button
                    type="button"
                    className="studio-template-picker__use"
                    disabled={busy}
                    onClick={(event) => {
                      event.stopPropagation();
                      confirm(option);
                    }}
                  >
                    {busy
                      ? TEMPLATE_PICKER_SELECT_BUSY_LABEL
                      : TEMPLATE_PICKER_SELECT_LABEL}
                  </button>
                ) : null}
              </div>
              <strong>{option.title}</strong>
              <span className="studio-template-picker__desc">
                {option.description}
              </span>
            </div>
          );
        })}
      </div>

      <div className="studio-template-picker__actions">
        <button
          type="button"
          className="studio-template-picker__back"
          disabled={busy}
          onClick={handleBack}
        >
          {TEMPLATE_PICKER_BACK_LABEL}
        </button>
      </div>
    </div>
  );

  if (embedded) {
    return (
      <div
        className="studio-onboard__card studio-onboard__card--templates"
        role="region"
        aria-label={TEMPLATE_PICKER_TITLE}
      >
        {body}
      </div>
    );
  }

  return (
    <div
      className="studio-modal"
      role="dialog"
      aria-label={TEMPLATE_PICKER_TITLE}
    >
      <div className="studio-modal__card studio-modal__card--templates">
        {body}
      </div>
    </div>
  );
}
