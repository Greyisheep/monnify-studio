"use client";

import Image from "next/image";
import { useState } from "react";

import type { StudioPath } from "@/types";

export interface PathGateProps {
  busy?: boolean;
  error?: string | null;
  onContinue: (path: StudioPath) => void;
}

export function PathGate({ busy = false, error = null, onContinue }: PathGateProps) {
  const [selected, setSelected] = useState<StudioPath | null>(null);

  return (
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
          disabled={busy}
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
          disabled={busy}
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

      {error ? <p className="studio-onboard__error">{error}</p> : null}

      <button
        type="button"
        className="studio-path-gate__continue"
        disabled={!selected || busy}
        onClick={() => selected && onContinue(selected)}
      >
        {busy ? "Saving…" : "Continue"}
      </button>
    </div>
  );
}
