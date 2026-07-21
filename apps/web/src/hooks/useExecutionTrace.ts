/**
 * Run an IR workflow and stream the redacted execution trace (#28, #8, D15).
 * Deep module: components never talk to SSE directly.
 */
"use client";

import { useCallback, useRef, useState } from "react";

import {
  startExecution,
  streamExecutionEvents,
} from "@/lib/api";
import type {
  ExecutionAdapter,
  ExecutionEvent,
  ExecutionRun,
  Workflow,
} from "@/types";

export interface UseExecutionTraceResult {
  run: ExecutionRun | null;
  events: ExecutionEvent[];
  selectedSeq: number | null;
  running: boolean;
  error: string | null;
  setSelectedSeq: (seq: number | null) => void;
  runWorkflow: (workflow: Workflow, adapter: ExecutionAdapter) => Promise<void>;
  clear: () => void;
}

export function useExecutionTrace(): UseExecutionTraceResult {
  const [run, setRun] = useState<ExecutionRun | null>(null);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [selectedSeq, setSelectedSeq] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRun(null);
    setEvents([]);
    setSelectedSeq(null);
    setError(null);
    setRunning(false);
  }, []);

  const runWorkflow = useCallback(async (workflow: Workflow, adapter: ExecutionAdapter) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setError(null);
    setEvents([]);
    setSelectedSeq(null);
    setRun(null);

    try {
      const started = await startExecution(workflow, adapter);
      if (controller.signal.aborted) return;
      setRun(started.run);

      await streamExecutionEvents(
        started.run.id,
        (event) => {
          setEvents((current) => {
            if (current.some((item) => item.seq === event.seq)) return current;
            return [...current, event].sort((left, right) => left.seq - right.seq);
          });
        },
        controller.signal,
      );
    } catch (caught) {
      if (controller.signal.aborted) return;
      const message =
        caught instanceof Error ? caught.message : "Execution failed";
      setError(
        message.includes("Failed to fetch") || message.includes("NetworkError")
          ? "Live API required to run. Start the backend on NEXT_PUBLIC_API_URL."
          : message,
      );
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  }, []);

  return {
    run,
    events,
    selectedSeq,
    running,
    error,
    setSelectedSeq,
    runWorkflow,
    clear,
  };
}
