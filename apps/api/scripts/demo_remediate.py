"""Runnable proof of Apply-Fix, no UI required (#6).

    python scripts/demo_remediate.py

Analyze the unsafe hero, then let remediation drive it to zero findings, printing
each fix it applies along the way.
"""

from __future__ import annotations

import sys

from monnify_studio.analysis import analyze
from monnify_studio.fixtures import unsafe_marketplace
from monnify_studio.providers import default_catalog
from monnify_studio.remediation import remediate_all


def main() -> int:
    catalog = default_catalog()
    wf = unsafe_marketplace()

    before = analyze(wf, catalog)
    print(f"\nBEFORE: {len(before.findings)} findings "
          f"({before.counts['critical']} critical, {before.counts['high']} high)")
    for f in before.findings:
        print(f"  • [{f.rule_id}] {f.title}")

    result = remediate_all(wf, catalog)

    print("\nAPPLY-FIX:")
    for i, step in enumerate(result.steps, 1):
        detail = ""
        if step.added_nodes:
            detail = f"  (+{', '.join(step.added_nodes)})"
        elif step.removed_nodes:
            detail = f"  (−{', '.join(step.removed_nodes)})"
        print(f"  {i}. [{step.rule_id}] {step.action}{detail}")

    after = analyze(result.workflow, catalog)
    print(f"\nAFTER: {len(after.findings)} findings")
    ok = not after.findings
    print(f"\n{'✅ Remediated to a clean architecture.' if ok else '❌ Findings remain.'}\n")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
