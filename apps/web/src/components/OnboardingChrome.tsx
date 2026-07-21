"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import type { OnboardingStep } from "@/types";

type CrumbId = "user_type" | "setup";

const STEPS: { id: CrumbId; label: string; icon: string }[] = [
  { id: "user_type", label: "User Type", icon: "/figma/icon-business.svg" },
  { id: "setup", label: "Set up", icon: "/figma/icon-webhook.svg" },
];

function crumbFor(step: OnboardingStep): CrumbId {
  return step === "user_type" ? "user_type" : "setup";
}

export function OnboardingChrome({
  active,
  children,
}: {
  active: OnboardingStep;
  children: ReactNode;
}) {
  const activeCrumb = crumbFor(active);
  const activeIndex = STEPS.findIndex((step) => step.id === activeCrumb);

  // Every onboarding screen sits on a solid light page in Figma (233:7084) - no
  // frosted-over-the-studio treatment.
  return (
    <div
      className="studio-onboard"
      role="dialog"
      aria-modal="true"
    >
      <header className="studio-onboard__top">
        <div className="studio-onboard__brand">
          <Image
            src="/figma/monnify-logo.svg"
            alt=""
            width={24}
            height={24}
            unoptimized
          />
          <strong>Monnify Studio</strong>
        </div>
        <nav className="studio-onboard__crumbs" aria-label="Onboarding steps">
          {STEPS.map((step, index) => {
            const isActive = step.id === activeCrumb;
            const isPast = index < activeIndex;
            return (
              <span
                key={step.id}
                className={`studio-onboard__crumb${isActive ? " is-active" : ""}${
                  isPast ? " is-past" : ""
                }`}
              >
                <Image
                  src={step.icon}
                  alt=""
                  width={14}
                  height={14}
                  unoptimized
                />
                {step.label}
                {index < STEPS.length - 1 ? (
                  <span className="studio-onboard__sep" aria-hidden />
                ) : null}
              </span>
            );
          })}
        </nav>
      </header>
      <div className="studio-onboard__body">{children}</div>
    </div>
  );
}
