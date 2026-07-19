"""IR interpreter: walk the graph, emit a streamed ExecutionEvent trace (#8, D1, D2).

MVP behaviour:
  * Walk control-flow successors from the entrypoint (or first root).
  * Event/wait nodes emit `node.waiting` then auto-resume under MockAdapter so a
    single POST produces a complete happy-path stream for the #28 viewer.
  * Adapter is the only I/O seam (D2).
"""

from __future__ import annotations

from collections import deque
from typing import Any
from uuid import uuid4

from ..ir.models import Workflow
from ..observability import get_logger
from .adapter import Adapter, AdapterResult, MockAdapter
from .events import ExecutionEvent, ExecutionEventType, ExecutionRun, RunStatus
from .store import ExecutionStore, execution_store

log = get_logger("executor")


def _entrypoint(workflow: Workflow) -> str:
    if workflow.entrypoint and workflow.has_node(workflow.entrypoint):
        return workflow.entrypoint
    roots = workflow.roots()
    if not roots:
        raise ValueError("workflow has no entrypoint or root nodes")
    return roots[0]


def _control_successors(workflow: Workflow, node_id: str) -> list[str]:
    return [
        edge.target
        for edge in workflow.edges
        if edge.source == node_id and edge.kind != "event"
    ]


def _event_successors(workflow: Workflow, node_id: str) -> list[str]:
    return [
        edge.target
        for edge in workflow.edges
        if edge.source == node_id and edge.kind == "event"
    ]


def _emit(
    store: ExecutionStore,
    run_id: str,
    event_type: ExecutionEventType,
    *,
    node_id: str | None = None,
    node_type: str | None = None,
    message: str = "",
    duration_ms: int | None = None,
    request: dict[str, Any] | None = None,
    response: dict[str, Any] | None = None,
    outputs: dict[str, Any] | None = None,
    error: str | None = None,
) -> ExecutionEvent:
    return store.append(
        ExecutionEvent(
            run_id=run_id,
            seq=0,  # overwritten by store
            type=event_type,
            node_id=node_id,
            node_type=node_type,
            message=message,
            duration_ms=duration_ms,
            request=request,
            response=response,
            outputs=outputs or {},
            error=error,
        )
    )


def run_workflow(
    workflow: Workflow,
    *,
    adapter: Adapter | None = None,
    store: ExecutionStore | None = None,
    auto_resume_waits: bool = True,
) -> ExecutionRun:
    """Execute `workflow` synchronously, buffering events into `store`."""
    store = store or execution_store
    adapter = adapter or MockAdapter()
    run = store.create(
        ExecutionRun(
            id=uuid4().hex,
            workflow_id=workflow.id,
            adapter=adapter.name,
            status=RunStatus.RUNNING,
        )
    )
    context: dict[str, Any] = {"variables": {}, "outputs": {}}

    try:
        start = _entrypoint(workflow)
        # Include other graph islands (e.g. webhook / fulfilment roots) so the
        # mock trace covers the whole hero, not only the entrypoint spine.
        other_roots = [root for root in workflow.roots() if root != start]
        queue: deque[str] = deque([start, *other_roots])
        seen: set[str] = set()

        _emit(
            store,
            run.id,
            ExecutionEventType.RUN_STARTED,
            message=f"run started via {adapter.name}",
        )

        while queue:
            node_id = queue.popleft()
            if node_id in seen:
                continue
            seen.add(node_id)
            node = workflow.node(node_id)

            _emit(
                store,
                run.id,
                ExecutionEventType.NODE_STARTED,
                node_id=node.id,
                node_type=node.type,
                message=node.label or node.type,
            )

            result: AdapterResult = adapter.invoke(node, context)
            context["outputs"][node.id] = result.outputs

            if result.waiting:
                store.set_status(run.id, RunStatus.WAITING)
                _emit(
                    store,
                    run.id,
                    ExecutionEventType.NODE_WAITING,
                    node_id=node.id,
                    node_type=node.type,
                    message="suspended at wait/event node (D1)",
                    duration_ms=result.duration_ms,
                    request=result.request,
                    response=result.response,
                    outputs=result.outputs,
                )
                if not auto_resume_waits:
                    return store.get(run.id)  # type: ignore[return-value]
                # Mock path: synthetic external event arrives immediately.
                _emit(
                    store,
                    run.id,
                    ExecutionEventType.LOG,
                    node_id=node.id,
                    node_type=node.type,
                    message="auto-resumed wait (mock)",
                )
                store.set_status(run.id, RunStatus.RUNNING)

            if not result.ok:
                _emit(
                    store,
                    run.id,
                    ExecutionEventType.NODE_FAILED,
                    node_id=node.id,
                    node_type=node.type,
                    message=result.error or "adapter failed",
                    duration_ms=result.duration_ms,
                    request=result.request,
                    response=result.response,
                    error=result.error,
                )
                store.set_status(
                    run.id, RunStatus.FAILED, error=result.error, finished=True
                )
                _emit(
                    store,
                    run.id,
                    ExecutionEventType.RUN_FAILED,
                    message=result.error or "run failed",
                    error=result.error,
                )
                return store.get(run.id)  # type: ignore[return-value]

            _emit(
                store,
                run.id,
                ExecutionEventType.NODE_COMPLETED,
                node_id=node.id,
                node_type=node.type,
                message=node.label or node.type,
                duration_ms=result.duration_ms,
                request=result.request,
                response=result.response,
                outputs=result.outputs,
            )

            for nxt in _control_successors(workflow, node.id):
                if nxt not in seen:
                    queue.append(nxt)
            # After a wait auto-resume, follow event edges too so webhook paths run.
            if result.waiting and auto_resume_waits:
                for nxt in _event_successors(workflow, node.id):
                    if nxt not in seen:
                        queue.append(nxt)

        store.set_status(run.id, RunStatus.COMPLETED, finished=True)
        _emit(store, run.id, ExecutionEventType.RUN_COMPLETED, message="run completed")
        log.info("executor.run.completed", run_id=run.id, nodes=len(seen))
        return store.get(run.id)  # type: ignore[return-value]
    except Exception as exc:  # noqa: BLE001 - surface as run failure for the viewer
        store.set_status(run.id, RunStatus.FAILED, error=str(exc), finished=True)
        _emit(
            store,
            run.id,
            ExecutionEventType.RUN_FAILED,
            message=str(exc),
            error=str(exc),
        )
        log.info("executor.run.failed", run_id=run.id, error=str(exc))
        return store.get(run.id)  # type: ignore[return-value]
