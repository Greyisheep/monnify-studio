"""In-memory execution runs + event buffers (#8).

Postgres-backed store comes later; this is enough for the #28 SSE consumer and
tests. One process, one dictionary.
"""

from __future__ import annotations

from threading import Lock

from .events import ExecutionEvent, ExecutionRun, RunStatus


class ExecutionStore:
    def __init__(self) -> None:
        self._runs: dict[str, ExecutionRun] = {}
        self._events: dict[str, list[ExecutionEvent]] = {}
        self._lock = Lock()

    def create(self, run: ExecutionRun) -> ExecutionRun:
        with self._lock:
            self._runs[run.id] = run
            self._events[run.id] = []
            return run

    def get(self, run_id: str) -> ExecutionRun | None:
        with self._lock:
            return self._runs.get(run_id)

    def list_runs(self, workflow_id: str, *, limit: int = 10) -> list[ExecutionRun]:
        """Recent runs for one workflow, newest first (dashboard activity, #78)."""
        with self._lock:
            runs = [r for r in self._runs.values() if r.workflow_id == workflow_id]
        runs.sort(key=lambda r: r.created_at, reverse=True)
        return runs[:limit]

    def set_status(
        self,
        run_id: str,
        status: RunStatus,
        *,
        error: str | None = None,
        finished: bool = False,
    ) -> None:
        with self._lock:
            run = self._runs[run_id]
            run.status = status
            if error is not None:
                run.error = error
            if finished:
                from datetime import datetime, timezone

                run.finished_at = datetime.now(timezone.utc)

    def append(self, event: ExecutionEvent) -> ExecutionEvent:
        with self._lock:
            events = self._events[event.run_id]
            event.seq = len(events)
            events.append(event)
            return event

    def list_events(self, run_id: str, *, after_seq: int = -1) -> list[ExecutionEvent]:
        with self._lock:
            return [e for e in self._events.get(run_id, []) if e.seq > after_seq]


execution_store = ExecutionStore()
