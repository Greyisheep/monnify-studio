/**
 * Soft spotlight + Figma-like tour card (#103).
 */
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { TourStep } from "@/lib/tourSteps";

export interface OnboardingTourProps {
  step: TourStep;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

function targetRect(target: string): DOMRect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!(el instanceof HTMLElement)) return null;
  return el.getBoundingClientRect();
}

export function OnboardingTour({
  step,
  stepIndex,
  stepCount,
  onNext,
  onBack,
  onSkip,
}: OnboardingTourProps) {
  const [hole, setHole] = useState<DOMRect | null>(null);

  useEffect(() => {
    function measure() {
      setHole(targetRect(step.target));
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onSkip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const last = stepIndex >= stepCount - 1;
  const pad = 8;
  const holeStyle = hole
    ? {
        top: Math.max(0, hole.top - pad),
        left: Math.max(0, hole.left - pad),
        width: hole.width + pad * 2,
        height: hole.height + pad * 2,
      }
    : null;

  const cardTop = hole
    ? Math.min(window.innerHeight - 220, hole.bottom + 16)
    : 96;
  const cardLeft = hole
    ? Math.min(window.innerWidth - 340, Math.max(16, hole.left))
    : 24;

  return (
    <div className="studio-tour" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      <div className="studio-tour__dim" onClick={onSkip} />
      {holeStyle ? (
        <div className="studio-tour__hole" style={holeStyle} aria-hidden />
      ) : null}
      <div
        className="studio-tour__card"
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="studio-tour__card-head">
          <span className="studio-tour__brand">
            <Image
              src="/figma/monnify-logo.svg"
              alt=""
              width={16}
              height={16}
              unoptimized
            />
            Monnify
          </span>
          <span className="studio-tour__progress">
            {stepIndex + 1}/{stepCount}
          </span>
        </div>
        <h2 className="studio-tour__title">{step.title}</h2>
        <p className="studio-tour__body">{step.body}</p>
        <div className="studio-tour__actions">
          <button type="button" className="studio-btn studio-btn--ghost" onClick={onSkip}>
            Skip
          </button>
          <div className="studio-tour__nav">
            <button
              type="button"
              className="studio-btn studio-btn--ghost"
              disabled={stepIndex === 0}
              onClick={onBack}
            >
              Back
            </button>
            <button
              type="button"
              className="studio-btn studio-btn--primary"
              onClick={onNext}
            >
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
