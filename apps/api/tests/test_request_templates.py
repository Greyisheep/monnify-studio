"""Every Monnify block ships its request body, grounded in the spec (#176)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.providers import default_catalog

client = TestClient(app)

# The 10 Monnify endpoints we model, each must carry method + path + a body.
_MONNIFY_TYPES = {
    "monnify.initialize_transaction",
    "monnify.verify_transaction",
    "monnify.create_reserved_account",
    "monnify.create_invoice",
    "monnify.initiate_transfer",
    "monnify.bulk_transfer",
    "monnify.query_transfer_status",
    "monnify.validate_bank_account",
    "monnify.transaction_split",
    "monnify.initiate_refund",
}


def test_every_monnify_node_has_a_grounded_request_template():
    catalog = default_catalog()
    for t in _MONNIFY_TYPES:
        defn = catalog.resolve(t)
        assert defn.method in {"GET", "POST", "PUT"}, t
        assert defn.path.startswith("/api/"), t
        assert defn.request_template, f"{t} has no request template"


def test_catalog_endpoint_ships_the_template_to_the_ui():
    catalog = client.get("/catalog").json()
    init = catalog["monnify.initialize_transaction"]
    assert init["method"] == "POST"
    assert init["path"] == "/api/v1/merchant/transactions/init-transaction"
    body = init["request_template"]
    # Exact fields from the Monnify OpenAPI spec.
    for field in ("amount", "customerName", "customerEmail", "paymentReference",
                  "contractCode", "currencyCode"):
        assert field in body, field
    # doc grounding travels too, so Moni/the dev reason from the real shape.
    assert init["doc_url"]
    assert init["when_to_use"]


def test_transfer_template_matches_disbursement_fields():
    catalog = client.get("/catalog").json()
    tx = catalog["monnify.initiate_transfer"]
    assert tx["path"] == "/api/v2/disbursements/single"
    for field in ("amount", "destinationBankCode", "destinationAccountNumber",
                  "reference", "narration"):
        assert field in tx["request_template"], field


def test_non_monnify_nodes_have_no_endpoint():
    """Safety/app nodes are local logic, not HTTP calls - no request template."""
    catalog = client.get("/catalog").json()
    guard = catalog.get("safety.balance_guard")
    if guard is not None:
        assert guard["request_template"] == {}
        assert guard["path"] == ""
