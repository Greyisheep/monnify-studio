/**
 * Template picker matching Figma 103:3264 (default) / 104:3372 (selected).
 * Selected thumb: teal border + grey fill + "Use Template" pill.
 * No Cancel/Close/Back chrome — Figma cards only.
 * Provenance: #55, #51, #103, Figma Monnify-challenge.
 */
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export interface TemplatePickerProps {
  open: boolean;
  busy: boolean;
  dismissible?: boolean;
  /** Render inside onboarding chrome instead of a full-screen modal. */
  embedded?: boolean;
  /**
   * "business-onboarding": the business door's first landing (#134, #135).
   * No Blank Canvas (that is the developer's / opt-in-graduation surface);
   * adds the ajo card and a "Something else -> Moni" escape hatch instead.
   * Any other value (or omitted) keeps the original four-card set.
   */
  variant?: "default" | "business-onboarding";
  onClose: () => void;
  onPick: (templateId: string) => void;
  onBlank?: () => void;
  /** "Something else" card: hands off to Moni instead of a template (#135). */
  onOther?: () => void;
  onBack?: () => void;
}

type PickerOption = {
  id: string;
  title: string;
  description: string;
  /** Figma export path, or null for a plain placeholder tile (art pending). */
  image: string | null;
  emoji?: string;
  kind: "blank" | "template" | "other";
};

const OPTIONS: PickerOption[] = [
  {
    id: "__blank__",
    title: "Blank Canvas",
    description: "Start your workflow from a blank canvas",
    /* Figma 103:3306 — warm fill + centered plus */
    image: "/figma/templates/template-blank.png",
    kind: "blank",
  },
  {
    id: "sell-online",
    title: "Get Verified Payments",
    description: "Setup a payment link and a dashboard for your orders",
    /* Figma 103:3312 */
    image: "/figma/templates/template-payments.png",
    kind: "template",
  },
  {
    id: "invoice",
    title: "Invoice a customer",
    description: "Create invoices to share to customers",
    /* Figma 103:3317 */
    image: "/figma/templates/template-invoice.png",
    kind: "template",
  },
  {
    id: "payroll",
    title: "Pay salaries",
    description: "Verify staff accounts before payouts",
    /* Figma 103:3322 */
    image: "/figma/templates/template-payroll.png",
    kind: "template",
  },
];

// Business door's first landing (#134): sell -> invoice -> ajo -> pay staff,
// then an honest escape hatch. No Blank Canvas here on purpose (#135) - a
// low-knowledge business owner should never land on an empty graph.
const BUSINESS_ONBOARDING_OPTIONS: PickerOption[] = [
  {
    id: "sell-online",
    title: "Get Verified Payments",
    description: "Setup a payment link and a dashboard for your orders",
    image: "/figma/templates/template-payments.png",
    kind: "template",
  },
  {
    id: "invoice",
    title: "Invoice a customer",
    description: "Create invoices to share to customers",
    image: "/figma/templates/template-invoice.png",
    kind: "template",
  },
  {
    id: "ajo",
    title: "Collect contributions (Ajo)",
    description: "Members pay in, and one person takes the pool each round",
    image: null,
    emoji: "🤝",
    kind: "template",
  },
  {
    id: "payroll",
    title: "Pay salaries",
    description: "Verify staff accounts before payouts",
    image: "/figma/templates/template-payroll.png",
    kind: "template",
  },
  {
    id: "__other__",
    title: "Something else",
    description: "Tell Moni what you do and she will build it",
    image: null,
    emoji: "✨",
    kind: "other",
  },
];

export function TemplatePicker({
  open,
  busy,
  embedded = false,
  variant = "default",
  onPick,
  onBlank,
  onOther,
}: TemplatePickerProps) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);

  if (!open) return null;

  const choices =
    variant === "business-onboarding"
      ? BUSINESS_ONBOARDING_OPTIONS
      : onBlank
        ? OPTIONS
        : OPTIONS.filter((option) => option.kind !== "blank");

  function confirm(option: PickerOption) {
    if (busy) return;
    if (option.kind === "blank") {
      onBlank?.();
      return;
    }
    if (option.kind === "other") {
      onOther?.();
      return;
    }
    onPick(option.id);
  }

  const body = (
    <div className="studio-template-picker">
      <header className="studio-template-picker__header">
        <h2>What do you want to set up?</h2>
        <p>Pick one. Each one is checked to be safe before it goes live.</p>
      </header>

      <div
        className="studio-template-picker__grid"
        role="radiogroup"
        aria-label="Templates"
      >
        {choices.map((option) => {
          const isSelected = selected === option.id;
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
                  option.kind === "blank" ? " is-blank" : ""
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
                    {option.emoji ?? "＋"}
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
                    {busy ? "Opening…" : "Use Template"}
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
    </div>
  );

  if (embedded) {
    return (
      <div
        className="studio-onboard__card studio-onboard__card--templates"
        role="region"
        aria-label="Pick a template"
      >
        {body}
      </div>
    );
  }

  return (
    <div
      className="studio-modal"
      role="dialog"
      aria-label="What do you want to set up?"
    >
      <div className="studio-modal__card studio-modal__card--templates">
        {body}
      </div>
    </div>
  );
}
