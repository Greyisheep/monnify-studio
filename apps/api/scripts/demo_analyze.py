"""Runnable proof of the thesis, no UI required.

    python scripts/demo_analyze.py

Loads the unsafe hero, runs the architecture review, prints findings; then does
the safe hero and shows it comes back clean.
"""

from __future__ import annotations

import sys

from monnify_studio.analysis import Report, analyze
from monnify_studio.fixtures import safe_marketplace, unsafe_marketplace
from monnify_studio.providers import default_catalog

SEV_ICON = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🔵", "info": "⚪"}


def print_report(title: str, report: Report) -> None:
    c = report.counts
    print(f"\n{'=' * 68}\n  {title}\n{'=' * 68}")
    print(
        f"  Critical: {c['critical']}   High: {c['high']}   "
        f"Medium: {c['medium']}   Low: {c['low']}"
    )
    if not report.findings:
        print("\n  ✅ No architectural findings. Ship it.\n")
        return
    for f in report.findings:
        icon = SEV_ICON.get(f.severity.value, "•")
        print(f"\n  {icon} [{f.rule_id}] {f.title}  ({f.severity.value.upper()})")
        print(f"     risk:  {f.message}")
        if f.path:
            print(f"     path:  {' → '.join(f.path)}")
        elif f.node_ids:
            print(f"     nodes: {', '.join(f.node_ids)}")
        print(f"     fix:   {f.remediation}")
    print()


def main() -> int:
    catalog = default_catalog()
    unsafe = analyze(unsafe_marketplace(), catalog)
    safe = analyze(safe_marketplace(), catalog)

    print_report("MARKETPLACE - UNSAFE (what a naive integration ships)", unsafe)
    print_report("MARKETPLACE - SAFE (after Apply-Fix remediation)", safe)

    # Exit non-zero if the invariant we designed for is violated.
    ok = unsafe.criticals >= 1 and safe.criticals == 0
    print(f"Thesis check: unsafe has criticals ({unsafe.criticals}) and safe is clean "
          f"({safe.criticals}) → {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
