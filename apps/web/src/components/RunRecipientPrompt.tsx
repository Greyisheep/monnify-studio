"use client";

import { useState } from "react";

export interface RunContact {
  whatsapp?: string;
  email?: string;
}

interface RunRecipientPromptProps {
  /** Pre-fill from the last run so we do not re-ask for what they already typed. */
  initial?: RunContact;
  onSend: (contact: RunContact) => void;
  onSkip: () => void;
  onCancel: () => void;
}

/**
 * Shown right before a Run when the flow has a notify block. The confirmation is
 * the "wow" of the demo, so we actively invite the tester to put their own
 * WhatsApp / email in and feel it land - instead of it silently going nowhere.
 */
export function RunRecipientPrompt({
  initial,
  onSend,
  onSkip,
  onCancel,
}: RunRecipientPromptProps) {
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const canSend = whatsapp.trim().length >= 6 || email.includes("@");

  return (
    <div
      className="run-recipient__scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby="run-recipient-title"
      onClick={onCancel}
    >
      <div className="run-recipient__card" onClick={(e) => e.stopPropagation()}>
        <div className="run-recipient__badge" aria-hidden>
          📱
        </div>
        <h2 id="run-recipient-title" className="run-recipient__title">
          Get the confirmation yourself
        </h2>
        <p className="run-recipient__sub">
          This flow sends a confirmation. Drop your WhatsApp number (or email) and
          we&apos;ll send it straight to you when it runs, so you can feel it land.
        </p>

        <label className="run-recipient__label" htmlFor="run-recipient-whatsapp">
          Your WhatsApp number
        </label>
        <input
          id="run-recipient-whatsapp"
          className="run-recipient__input"
          type="tel"
          inputMode="tel"
          autoFocus
          placeholder="e.g. 0803 123 4567"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSend)
              onSend({ whatsapp: whatsapp.trim(), email: email.trim() });
          }}
        />

        <label className="run-recipient__label" htmlFor="run-recipient-email">
          Email <span className="run-recipient__muted">(optional)</span>
        </label>
        <input
          id="run-recipient-email"
          className="run-recipient__input"
          type="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSend)
              onSend({ whatsapp: whatsapp.trim(), email: email.trim() });
          }}
        />

        <div className="run-recipient__actions">
          <button
            type="button"
            className="run-recipient__primary"
            disabled={!canSend}
            onClick={() => onSend({ whatsapp: whatsapp.trim(), email: email.trim() })}
          >
            Send it to me &amp; run
          </button>
          <button type="button" className="run-recipient__ghost" onClick={onSkip}>
            Run without notifying
          </button>
        </div>
      </div>
    </div>
  );
}
