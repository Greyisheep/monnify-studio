"""Per-workflow Monnify credentials: their secrets, their money (#68, D19)."""

from __future__ import annotations

import io
import json

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.credentials import CredentialStore, MonnifyCredentials
from monnify_studio.observability import configure_logging, get_logger

client = TestClient(app)

_CREDS = {"api_key": "MK_TEST_abc123", "secret_key": "SK_super_secret_9z", "contract_code": "778899"}


def _a_workflow_id() -> str:
    # A real, stored workflow (from-template) so the credential endpoints accept it.
    return client.post("/workflows/from-template/sell-online").json()["workflow"]["id"]


def test_put_get_delete_roundtrip():
    wid = _a_workflow_id()
    assert client.get(f"/workflows/{wid}/credentials").json()["source"] in {"platform", "none"}

    res = client.put(f"/workflows/{wid}/credentials", json=_CREDS)
    assert res.status_code == 200
    assert res.json() == {"workflow_id": wid, "configured": True, "source": "workflow"}

    assert client.get(f"/workflows/{wid}/credentials").json()["source"] == "workflow"
    client.delete(f"/workflows/{wid}/credentials")
    assert client.get(f"/workflows/{wid}/credentials").json()["source"] in {"platform", "none"}


def test_secret_values_are_never_returned():
    wid = _a_workflow_id()
    for res in (
        client.put(f"/workflows/{wid}/credentials", json=_CREDS),
        client.get(f"/workflows/{wid}/credentials"),
    ):
        body = res.text
        assert _CREDS["api_key"] not in body
        assert _CREDS["secret_key"] not in body
        assert "api_key" not in res.json()  # no secret fields on the model at all


def test_credentials_require_a_real_workflow():
    assert client.put("/workflows/nope/credentials", json=_CREDS).status_code == 404


def test_settings_for_prefers_workflow_then_platform():
    store = CredentialStore()
    # No creds: falls back to platform settings (base url unchanged).
    platform = store.settings_for("wf-x")
    assert "sandbox" in platform.monnify_base_url

    store.put("wf-x", MonnifyCredentials(**_CREDS))
    resolved = store.settings_for("wf-x")
    assert resolved.monnify_api_key == _CREDS["api_key"]
    assert resolved.monnify_contract_code == _CREDS["contract_code"]
    # The user set keys, but NOT the base url: it stays the platform sandbox (guard).
    assert resolved.monnify_base_url == platform.monnify_base_url


def test_stored_secret_is_redacted_in_logs():
    buf = io.StringIO()
    configure_logging(stream=buf)
    CredentialStore().put("wf-log", MonnifyCredentials(**_CREDS))
    get_logger("t").info("using key", note=f"key is {_CREDS['secret_key']}")
    line = json.loads([x for x in buf.getvalue().splitlines() if x.strip()][-1])
    assert _CREDS["secret_key"] not in line["note"]
