/**
 * Ajo rotating-pool panel (#173): the owner registers members, then the round
 * fills as members pay (verified money only). Polls so a live pay-in shows up
 * on camera; when the pot completes it rotates to the next beneficiary.
 */
"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import {
  fetchAjoState,
  putAjoMembers,
  simulateAjoContribution,
  type AjoStateDto,
} from "@/lib/api";
import { RosterTable, type RosterRow } from "./RosterTable";

interface AjoPanelProps {
  artifactId: string;
}

export interface AjoPanelHandle {
  addMember: () => void;
}

function naira(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return `NGN ${value}`;
  return `NGN ${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

export const AjoPanel = forwardRef<AjoPanelHandle, AjoPanelProps>(function AjoPanel(
  { artifactId },
  ref,
) {
  const [state, setState] = useState<AjoStateDto | null>(null);
  const [newMembers, setNewMembers] = useState<RosterRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const addSectionRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      addMember() {
        setNewMembers((rows) => [...rows, { name: "", whatsapp: "" }]);
        window.requestAnimationFrame(() => {
          addSectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          const inputs = addSectionRef.current?.querySelectorAll<HTMLInputElement>(
            ".roster__row input",
          );
          inputs?.[inputs.length - 2]?.focus();
        });
      },
    }),
    [],
  );

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
    const parsed = newMembers
      .map((m) => ({ name: (m.name ?? "").trim(), whatsapp: (m.whatsapp ?? "").trim() }))
      .filter((m) => m.name.length > 0);
    if (parsed.length === 0) return;
    // Existing members are sent by name only; the backend keeps their hidden
    // numbers (client never sees them, #234). New members carry their number.
    const existing = (state?.members ?? []).map((m) => ({ name: m.name }));
    setSaving(true);
    try {
      const next = await putAjoMembers(artifactId, [...existing, ...parsed]);
      setState(next);
      setNewMembers([]);
    } finally {
      setSaving(false);
    }
  };

  const simulate = async () => {
    setSimulating(true);
    try {
      const next = await simulateAjoContribution(artifactId);
      setState(next);
    } finally {
      setSimulating(false);
    }
  };

  const members = state?.members ?? [];
  const paidCount = members.filter((m) => m.paid).length;
  const allPaid = members.length > 0 && paidCount === members.length;

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
                  {m.paid
                    ? "Paid"
                    : m.nudge_status === "delivered"
                      ? "Nudged on WhatsApp"
                      : m.nudge_status === "failed"
                        ? "WhatsApp nudge failed"
                        : m.has_whatsapp
                          ? "Not nudged yet"
                          : "Not paid"}
                </span>
              </li>
            ))}
          </ul>
          <div className="biz-ajo__sim">
            <button
              type="button"
              className="biz-shoplink__preview"
              disabled={simulating || allPaid}
              onClick={() => void simulate()}
            >
              {simulating
                ? "Simulating…"
                : allPaid
                  ? "Round complete"
                  : "Simulate a pay-in"}
            </button>
            <span className="biz-ajo__sim-note">
              Demo only: advances the pool and sends the real WhatsApp nudge.
              Money in still needs a Monnify-verified payment.
            </span>
          </div>
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

      <div className="biz-ajo__add" ref={addSectionRef}>
        <label>Add members (or paste a list)</label>
        <RosterTable
          columns={[
            { key: "name", label: "Name", placeholder: "Ada Obi", width: "1.3fr" },
            { key: "whatsapp", label: "WhatsApp", placeholder: "0803…", width: "1fr", inputMode: "tel" },
          ]}
          rows={newMembers}
          onChange={setNewMembers}
          addLabel="+ Add member"
          emptyHint="No new members yet. Add one below, or paste a name, number list."
        />
        <button
          type="button"
          className="biz-product-panel__cta"
          disabled={saving || newMembers.every((m) => !(m.name ?? "").trim())}
          onClick={() => void addMembers()}
        >
          {saving ? "Adding…" : "Add to rotation"}
        </button>
      </div>
    </div>
  );
});
