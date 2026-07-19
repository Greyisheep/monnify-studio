"""Real Monnify sandbox call: proof of life (#7).

    python scripts/demo_sandbox.py

Requires MONNIFY_* keys in .env (see .env.example). Authenticates against the
sandbox and initializes a transaction, printing the live checkout URL you can
open in a browser. Every call is traced; secrets are redacted from the logs.
"""

from __future__ import annotations

from monnify_studio.config import get_settings
from monnify_studio.integrations.monnify import MonnifyError, MonnifySandboxClient
from monnify_studio.observability import configure_observability, correlation, new_id


def main() -> int:
    configure_observability(console_spans=False)  # keep the demo output readable
    settings = get_settings()
    try:
        settings.assert_monnify_credentials()
    except RuntimeError as exc:
        print(f"\n{exc}\nAdd them to .env (see .env.example), then re-run.\n")
        return 2

    try:
        with correlation(request_id=new_id("req")), MonnifySandboxClient(settings) as client:
            result = client.initialize_transaction(
                amount=100,
                customer_name="Ada Test",
                customer_email="ada@example.com",
                reference=new_id("studio-pol"),
            )
    except MonnifyError as exc:
        print(f"\nMonnify sandbox call failed: {exc}")
        print("Sandbox is known to be flaky; retry, or the mock-backed tests still prove the client.\n")
        return 1

    print("\nProof of life: Monnify sandbox transaction initialized.")
    print(f"  payment_reference:     {result['payment_reference']}")
    print(f"  transaction_reference: {result['transaction_reference']}")
    print(f"  checkout_url:          {result['checkout_url']}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
