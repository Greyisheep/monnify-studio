"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import type { OnboardingStep } from "@/types";

type CrumbId = "user_type" | "goal" | "setup" | "dashboard";

/** #127: User Type → What you want → Set up → Dashboard */
const STEPS: { id: CrumbId; label: string; icon: string }[] = [
  { id: "user_type", label: "User Type", icon: "/figma/icon-business.svg" },
  { id: "goal", label: "What you want", icon: "/figma/icon-workflow.svg" },
  { id: "setup", label: "Set up", icon: "/figma/icon-catalog-node.svg" },
  {
    id: "dashboard",
    label: "Dashboard",
    icon: "/figma/dashboard/icon-dashboard.svg",
  },
];

function crumbFor(step: OnboardingStep): CrumbId {
  if (step === "user_type") return "user_type";
  if (step === "template" || step === "intent") return "goal";
  if (step === "products") return "setup";
  return "dashboard";
}

/** Figma templates float over the studio whiteboard (103:3264), not a solid page. */
function overStudio(step: OnboardingStep): boolean {
  return step === "template" || step === "intent";
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
  const frosted = overStudio(active);

  return (
    <div
      className={`studio-onboard${frosted ? " is-over-studio" : ""}`}
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
