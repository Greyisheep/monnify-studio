"use client";

import Image from "next/image";
import { useState } from "react";

import type { StudioPath } from "@/lib/studioPath";

export interface PathGateProps {
  open: boolean;
  onContinue: (path: StudioPath) => void;
}

export function PathGate({ open, onContinue }: PathGateProps) {
  const [selected, setSelected] = useState<StudioPath | null>(null);

  if (!open) return null;

  return (
    <div className="studio-path-gate" role="dialog" aria-modal="true" aria-labelledby="studio-path-title">
      <div className="studio-path-gate__card">
        <header className="studio-path-gate__header">
          <h1 id="studio-path-title">Welcome to Monnify Studio</h1>
          <p>Choose how you want to start</p>
        </header>

        <div className="studio-path-gate__doors" role="radiogroup" aria-label="Who are you">
          <button
            type="button"
            role="radio"
            aria-checked={selected === "business"}
            className={`studio-path-gate__door${selected === "business" ? " is-selected" : ""}`}
            onClick={() => setSelected("business")}
          >
            <Image
              src="/figma/icon-business.svg"
              alt=""
              width={45}
              height={50}
              unoptimized
            />
            <span>I&apos;m a business owner</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={selected === "developer"}
            className={`studio-path-gate__door${selected === "developer" ? " is-selected" : ""}`}
            onClick={() => setSelected("developer")}
          >
            <Image
              src="/figma/icon-dev.svg"
              alt=""
              width={61}
              height={50}
              unoptimized
            />
            <span>I&apos;m a developer</span>
          </button>
        </div>

        <button
          type="button"
          className="studio-path-gate__continue"
          disabled={!selected}
          onClick={() => selected && onContinue(selected)}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
