/**
 * Soft spotlight + Figma tour card (#103).
 * Business card: node 189:6968 — white panel + media + external CTA row.
 * Developer: Hover Card chrome.
 */
"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import {
  primaryActionLabel,
  progressLabel,
} from "@/lib/tourController";
import type { TourPlacement, TourStep } from "@/lib/tourSteps";

export interface OnboardingTourProps {
  step: TourStep;
  stepIndex: number;
  stepCount: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

function targetRect(target: string): DOMRect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!(el instanceof HTMLElement)) return null;
  return el.getBoundingClientRect();
}

function placeCard(
  hole: DOMRect | null,
  cardWidth: number,
  cardHeight: number,
  placement: TourPlacement = "auto",
): { top: number; left: number } {
  if (!hole || placement === "center") {
    return {
      top: Math.max(24, (window.innerHeight - cardHeight) / 2),
      left: Math.max(16, (window.innerWidth - cardWidth) / 2),
    };
  }
  const gap = 16;
  const centeredLeft = Math.min(
    window.innerWidth - cardWidth - 16,
    Math.max(16, hole.left + hole.width / 2 - cardWidth / 2),
  );
  if (placement === "right") {
    return {
      top: Math.min(
        window.innerHeight - cardHeight - 16,
        Math.max(16, hole.top),
      ),
      left: Math.min(
        window.innerWidth - cardWidth - 16,
        Math.max(16, hole.right + gap),
      ),
    };
  }
  const below = hole.bottom + gap;
  const above = hole.top - cardHeight - gap;
  if (placement === "above") {
    return {
      top: Math.max(16, above),
      left: centeredLeft,
    };
  }
  if (placement === "below") {
    return {
      top: Math.min(window.innerHeight - cardHeight - 16, below),
      left: centeredLeft,
    };
  }
  const top =
    below + cardHeight <= window.innerHeight - 16
      ? below
      : above >= 16
        ? above
        : Math.min(window.innerHeight - cardHeight - 16, Math.max(16, hole.top));
  return { top, left: centeredLeft };
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
  const dashboard = step.chrome === "dashboard";
  const cardWidth = dashboard ? 222 : 307;
  const cardHeight = dashboard ? 360 : 200;

  useEffect(() => {
    function measure() {
      setHole(targetRect(step.target));
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const el = step.target
      ? document.querySelector(`[data-tour="${step.target}"]`)
      : null;
    el?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.target]);

  /*
   * Figma's dashboard tour does not punch a transparent hole through the
   * backdrop. It lifts the relevant dashboard region above a full-page
   * dim/blur veil, then places the tour card above that region. Keeping the
   * actual element (rather than a visual copy) means the highlighted content
   * stays accurate for each product/dashboard state.
   */
  useEffect(() => {
    if (!dashboard || !step.target) return;
    const target = document.querySelector(`[data-tour="${step.target}"]`);
    if (!(target instanceof HTMLElement)) return;

    target.classList.add("is-tour-spotlight");
    target.setAttribute("inert", "");
    return () => {
      target.classList.remove("is-tour-spotlight");
      target.removeAttribute("inert");
    };
  }, [dashboard, step.target]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onSkip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const last = stepIndex >= stepCount - 1;
  const { top: cardTop, left: cardLeft } = placeCard(
    hole,
    cardWidth,
    cardHeight,
    step.placement,
  );
  const progress = progressLabel(step.chrome, stepIndex, stepCount);
  const primaryLabel = primaryActionLabel(step.chrome, last);
  const showHeaderSkip = dashboard && stepIndex > 0;

  return (
    <div className="studio-tour" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      <div className="studio-tour__veil" aria-hidden />
      {dashboard ? (
        <div
          className="studio-tour__stack"
          style={{ top: cardTop, left: cardLeft, width: cardWidth }}
        >
          <div className="studio-tour__panel">
            <div className="studio-tour__step-row">
              <span className="studio-tour__progress">{progress}</span>
              {showHeaderSkip ? (
                <button
                  type="button"
                  className="studio-tour__skip-link"
                  onClick={onSkip}
                >
                  Skip tour
                </button>
              ) : null}
            </div>
            {step.imageSrc ? (
              <div className="studio-tour__media">
                <Image
                  src={step.imageSrc}
                  alt=""
                  width={206}
                  height={151}
                  className="studio-tour__media-img"
                  unoptimized
                />
              </div>
            ) : null}
            <div className="studio-tour__copy">
              <h2 className="studio-tour__title">{step.title}</h2>
              <p className="studio-tour__body">{step.body}</p>
            </div>
          </div>
          <div className="studio-tour__cta">
            {stepIndex === 0 ? (
              <button
                type="button"
                className="studio-tour__btn studio-tour__btn--outline"
                onClick={onSkip}
              >
                Skip tour
              </button>
            ) : (
              <button
                type="button"
                className="studio-tour__btn studio-tour__btn--outline"
                onClick={onBack}
              >
                Back
              </button>
            )}
            <button
              type="button"
              className="studio-tour__btn studio-tour__btn--primary"
              onClick={onNext}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="studio-tour__card is-hover"
          style={{ top: cardTop, left: cardLeft, width: cardWidth }}
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
            <span className="studio-tour__progress">{progress}</span>
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
                {primaryLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
