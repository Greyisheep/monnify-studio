"""In-memory versioned workflow store (P1.2 persist without Postgres yet).

Seeds from the hero fixtures. PUT appends a version. Swap for Postgres+Alembic
when D5 persistence lands for real sharing.
"""

from __future__ import annotations

from copy import deepcopy

from .fixtures import safe_marketplace, unsafe_marketplace
from .ir.models import Workflow


class WorkflowStore:
    def __init__(self) -> None:
        self._versions: dict[str, list[Workflow]] = {}
        for factory in (unsafe_marketplace, safe_marketplace):
            wf = factory()
            self._versions[wf.id] = [wf]

    def list_summaries(self) -> list[dict]:
        out = []
        for wid, versions in self._versions.items():
            latest = versions[-1]
            out.append(
                {
                    "id": wid,
                    "name": latest.name,
                    "description": latest.description,
                    "version": latest.version,
                    "versions": len(versions),
                }
            )
        return out

    def get(self, workflow_id: str) -> Workflow | None:
        versions = self._versions.get(workflow_id)
        if not versions:
            return None
        return deepcopy(versions[-1])

    def get_version(self, workflow_id: str, version: int) -> Workflow | None:
        versions = self._versions.get(workflow_id)
        if not versions:
            return None
        for wf in versions:
            if wf.version == version:
                return deepcopy(wf)
        return None

    def list_versions(self, workflow_id: str) -> list[int]:
        versions = self._versions.get(workflow_id) or []
        return [v.version for v in versions]

    def reset(self, workflow_id: str, seed: Workflow) -> Workflow:
        stored = deepcopy(seed)
        stored.id = workflow_id
        self._versions[workflow_id] = [stored]
        return deepcopy(stored)

    def save(self, workflow: Workflow) -> Workflow:
        """Append a new version (auto-bumps version if unchanged from latest)."""
        stored = deepcopy(workflow)
        bucket = self._versions.setdefault(stored.id, [])
        if bucket:
            latest = bucket[-1]
            if stored.version <= latest.version:
                stored.version = latest.version + 1
        else:
            stored.version = max(1, stored.version)
        bucket.append(stored)
        return deepcopy(stored)


store = WorkflowStore()
