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
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!(el instanceof HTMLElement)) return null;
  return el.getBoundingClientRect();
}

function placeCard(
  hole: DOMRect | null,
  cardWidth: number,
  cardHeight: number,
): { top: number; left: number } {
  if (!hole) {
    return {
      top: Math.max(24, (window.innerHeight - cardHeight) / 2),
      left: Math.max(16, (window.innerWidth - cardWidth) / 2),
    };
  }
  const gap = 16;
  const below = hole.bottom + gap;
  const above = hole.top - cardHeight - gap;
  const top =
    below + cardHeight <= window.innerHeight - 16
      ? below
      : above >= 16
        ? above
        : Math.min(window.innerHeight - cardHeight - 16, Math.max(16, hole.top));
  const left = Math.min(
    window.innerWidth - cardWidth - 16,
    Math.max(16, hole.left + hole.width / 2 - cardWidth / 2),
  );
  return { top, left };
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

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onSkip();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSkip]);

  const last = stepIndex >= stepCount - 1;
  const pad = 8;
  const holeBox = hole
    ? {
        top: Math.max(0, hole.top - pad),
        left: Math.max(0, hole.left - pad),
        width: hole.width + pad * 2,
        height: hole.height + pad * 2,
      }
    : null;

  const { top: cardTop, left: cardLeft } = placeCard(hole, cardWidth, cardHeight);
  const progress = progressLabel(step.chrome, stepIndex, stepCount);
  const primaryLabel = primaryActionLabel(step.chrome, last);
  const showHeaderSkip = dashboard && stepIndex > 0;

  const veil = holeBox
    ? (() => {
        const { top: t, left: l, width: w, height: h } = holeBox;
        const right = l + w;
        const bottom = t + h;
        return (
          <>
            <button
              type="button"
              aria-label="Dismiss tour"
              className="studio-tour__veil"
              style={{ top: 0, left: 0, right: 0, height: t }}
              onClick={onSkip}
            />
            <button
              type="button"
              aria-label="Dismiss tour"
              className="studio-tour__veil"
              style={{ top: bottom, left: 0, right: 0, bottom: 0 }}
              onClick={onSkip}
            />
            <button
              type="button"
              aria-label="Dismiss tour"
              className="studio-tour__veil"
              style={{ top: t, left: 0, width: l, height: h }}
              onClick={onSkip}
            />
            <button
              type="button"
              aria-label="Dismiss tour"
              className="studio-tour__veil"
              style={{ top: t, left: right, right: 0, height: h }}
              onClick={onSkip}
            />
            <div className="studio-tour__hole" style={holeBox} aria-hidden />
          </>
        );
      })()
    : (
        <button
          type="button"
          aria-label="Dismiss tour"
          className="studio-tour__veil studio-tour__veil--full"
          onClick={onSkip}
        />
      );

  return (
    <div className="studio-tour" role="dialog" aria-modal="true" aria-label="Onboarding tour">
      {veil}
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
