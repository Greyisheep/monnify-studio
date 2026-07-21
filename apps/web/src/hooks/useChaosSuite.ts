/**
 * Chaos scenario suite client (#11 / #29).
 * Returns null until POST /workflows/{id}/chaos/run exists on the API.
 */
"use client";

import { useCallback, useState } from "react";

import { runChaosSuite } from "@/lib/api";
import type { ChaosReport } from "@/types/chaos";
import type { Workflow } from "@/types";

export interface UseChaosSuiteResult {
  report: ChaosReport | null;
  loading: boolean;
  error: string | null;
  runSuite: (workflow: Workflow) => Promise<void>;
  clear: () => void;
}

export function useChaosSuite(): UseChaosSuiteResult {
  const [report, setReport] = useState<ChaosReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setReport(null);
    setError(null);
    setLoading(false);
  }, []);

  const runSuite = useCallback(async (workflow: Workflow) => {
    setLoading(true);
    setError(null);
    try {
      const next = await runChaosSuite(workflow);
      setReport(next);
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "Chaos suite failed";
      setError(message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  return { report, loading, error, runSuite, clear };
}
