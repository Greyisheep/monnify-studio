"use client";

import Image from "next/image";
import type { ReactNode } from "react";

import type { OnboardingStep } from "@/types";

const STEPS: { id: OnboardingStep; label: string; icon: string }[] = [
  { id: "user_type", label: "User Type", icon: "/figma/icon-business.svg" },
  {
    id: "products",
    label: "Product & Services",
    icon: "/figma/icon-webhook.svg",
  },
  { id: "dashboard", label: "Dashboard", icon: "/figma/icon-panel-left.svg" },
];

export function OnboardingChrome({
  active,
  children,
}: {
  active: OnboardingStep;
  children: ReactNode;
}) {
  const normalized = active === "template" ? "dashboard" : active;
  const activeIndex = STEPS.findIndex((step) => step.id === normalized);

  return (
    <div className="studio-onboard" role="dialog" aria-modal="true">
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
            const isActive = step.id === normalized;
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
                {index < STEPS.length - 1 && (
                  <span className="studio-onboard__sep" aria-hidden />
                )}
              </span>
            );
          })}
        </nav>
      </header>
      <div className="studio-onboard__body">{children}</div>
    </div>
  );
}
