/**
 * Ajo rotating-pool panel (#173): the owner registers members, then the round
 * fills as members pay (verified money only). Polls so a live pay-in shows up
 * on camera; when the pot completes it rotates to the next beneficiary.
 */
"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchAjoState, putAjoMembers, type AjoStateDto } from "@/lib/api";

interface AjoPanelProps {
  artifactId: string;
}

function naira(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return `NGN ${value}`;
  return `NGN ${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export function AjoPanel({ artifactId }: AjoPanelProps) {
  const [state, setState] = useState<AjoStateDto | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const next = await fetchAjoState(artifactId);
    if (next) setState(next);
  }, [artifactId]);

  useEffect(() => {
    void load();
    // Poll so a member's verified pay-in advances the round live (#173).
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [load]);

  const addMembers = async () => {
    const parsed = draft
      .split("\n")
      .map((line) => {
        const [name, whatsapp] = line.split(",").map((s) => s.trim());
        return { name: name ?? "", whatsapp: whatsapp ?? "" };
      })
      .filter((m) => m.name.length > 0);
    const existing = (state?.members ?? []).map((m) => ({ name: m.name }));
    const merged = [...existing, ...parsed];
    if (merged.length === 0) return;
    setSaving(true);
    try {
      const next = await putAjoMembers(artifactId, merged);
      setState(next);
      setDraft("");
    } finally {
      setSaving(false);
    }
  };

  const members = state?.members ?? [];
  const paidCount = members.filter((m) => m.paid).length;

  return (
    <div className="biz-ajo">
      {members.length > 0 ? (
        <>
          <div className="biz-ajo__status">
            <span>
              Round {state?.round ?? 1} · {paidCount} of {members.length} paid ·
              pot {naira(state?.pot ?? "0")}
              {state?.target ? ` of ${naira(state.target)}` : ""}
            </span>
            {state?.beneficiary ? (
              <span className="biz-ajo__turn">
                This round’s pot goes to <strong>{state.beneficiary}</strong>
              </span>
            ) : null}
          </div>
          <ul className="biz-ajo__members">
            {members.map((m) => (
              <li key={m.name} className={m.paid ? "is-paid" : "is-unpaid"}>
                <span className="biz-ajo__mark" aria-hidden>
                  {m.paid ? "✓" : "•"}
                </span>
                <span className="biz-ajo__name">
                  {m.name}
                  {m.is_beneficiary ? " (receives this round)" : ""}
                </span>
                <span className="biz-ajo__flag">
                  {m.paid ? "Paid" : m.has_whatsapp ? "Nudged on WhatsApp" : "Not paid"}
                </span>
              </li>
            ))}
          </ul>
          {(state?.payouts?.length ?? 0) > 0 ? (
            <div className="biz-ajo__payouts">
              <h3>Payouts</h3>
              <ul>
                {state!.payouts.map((p) => (
                  <li key={`${p.round}-${p.beneficiary}`}>
                    Round {p.round}: {naira(p.amount)} to <strong>{p.beneficiary}</strong>
                    <span className="biz-ajo__kind"> ({p.kind})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="biz-product-panel__hint">
          Register the members and the turn order to start the rotating pool.
          Everyone pays the fixed amount each round; when the pot is full, one
          member takes it and the turn rotates.
        </p>
      )}

      <div className="biz-ajo__add">
        <label htmlFor="ajo-members">Add members (one per line: name, WhatsApp)</label>
        <textarea
          id="ajo-members"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={"Ada, 08030000000\nBola, 08031111111"}
          rows={3}
          spellCheck={false}
        />
        <button
          type="button"
          className="biz-product-panel__cta"
          disabled={saving || draft.trim().length === 0}
          onClick={() => void addMembers()}
        >
          {saving ? "Adding…" : "Add to rotation"}
        </button>
      </div>
    </div>
  );
}
