"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  fetchCredentialStatus,
  putCredentials,
  type CredentialStatus,
} from "@/lib/api";

export interface CredentialsFormProps {
  workflowId: string | null;
  busy: boolean;
}

export function CredentialsForm({ workflowId, busy }: CredentialsFormProps) {
  const [status, setStatus] = useState<CredentialStatus | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [contractCode, setContractCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!workflowId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    void fetchCredentialStatus(workflowId).then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!workflowId) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await putCredentials(workflowId, {
        api_key: apiKey.trim(),
        secret_key: secretKey.trim(),
        contract_code: contractCode.trim(),
      });
      setStatus(next);
      setApiKey("");
      setSecretKey("");
      setContractCode("");
      setMessage("Credentials saved for this workflow.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (!workflowId) {
    return (
      <div className="studio-creds">
        <h3>Monnify credentials</h3>
        <p className="muted">Open a workflow to attach sandbox keys.</p>
      </div>
    );
  }

  return (
    <div className="studio-creds">
      <h3>Monnify credentials</h3>
      <p className="muted">
        {status?.configured
          ? `Configured (${status.source}). Values are write-only.`
          : "Not set — platform demo keys may be used."}
      </p>
      <form className="studio-creds__form" onSubmit={onSubmit}>
        <label>
          API key
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            disabled={busy || saving}
            required
          />
        </label>
        <label>
          Secret key
          <input
            type="password"
            autoComplete="off"
            value={secretKey}
            onChange={(event) => setSecretKey(event.target.value)}
            disabled={busy || saving}
            required
          />
        </label>
        <label>
          Contract code
          <input
            value={contractCode}
            onChange={(event) => setContractCode(event.target.value)}
            disabled={busy || saving}
            required
          />
        </label>
        <button
          type="submit"
          className="studio-btn studio-btn--primary"
          disabled={busy || saving}
        >
          {saving ? "Saving…" : "Save credentials"}
        </button>
      </form>
      {message && <p className="studio-creds__msg">{message}</p>}
    </div>
  );
}
