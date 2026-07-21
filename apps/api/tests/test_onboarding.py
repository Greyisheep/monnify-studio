from decimal import Decimal

from fastapi.testclient import TestClient

from monnify_studio.api.main import app
from monnify_studio.onboarding import SESSION_COOKIE, profile_store

client = TestClient(app)


def setup_function() -> None:
    profile_store.clear()
    client.cookies.clear()


def test_get_profile_issues_session_cookie():
    response = client.get("/studio/profile")
    assert response.status_code == 200
    assert SESSION_COOKIE in client.cookies
    body = response.json()
    assert body["path"] is None
    assert body["step"] == "user_type"
    assert body["goal"] is None
    assert body["products"] == []


def test_profile_persists_path_and_products_on_same_session():
    first = client.get("/studio/profile")
    assert first.status_code == 200
    assert SESSION_COOKIE in client.cookies

    put = client.put(
        "/studio/profile",
        json={
            "path": "business",
            "step": "products",
            "goal": "sell",
            "products": [
                {
                    "id": "p1",
                    "name": "Ankara Dress",
                    "price_ngn": 15000,
                    "image_url": None,
                }
            ],
        },
    )
    assert put.status_code == 200
    assert put.json()["path"] == "business"
    assert put.json()["goal"] == "sell"
    assert put.json()["products"][0]["name"] == "Ankara Dress"
    assert Decimal(str(put.json()["products"][0]["price_ngn"])) == Decimal("15000.00")

    second = client.get("/studio/profile")
    assert second.status_code == 200
    assert second.json()["path"] == "business"
    assert second.json()["step"] == "products"
    assert second.json()["goal"] == "sell"
    assert len(second.json()["products"]) == 1


def test_product_price_keeps_kobo_exact():
    """D21: 19.99 must not pick up binary float noise before storage."""
    client.get("/studio/profile")
    put = client.put(
        "/studio/profile",
        json={
            "path": "business",
            "step": "products",
            "products": [{"name": "Snack", "price_ngn": 19.99}],
        },
    )
    assert put.status_code == 200
    assert put.json()["products"][0]["price_ngn"] == "19.99"


def test_developer_path_can_skip_to_done():
    client.get("/studio/profile")
    put = client.put(
        "/studio/profile",
        json={"path": "developer", "step": "done", "products": []},
    )
    assert put.status_code == 200
    assert put.json()["path"] == "developer"
    assert put.json()["step"] == "done"


def test_business_template_invoice_goes_to_dashboard():
    """Non-shop templates skip products and land on the dashboard."""
    client.get("/studio/profile")
    client.put(
        "/studio/profile",
        json={"path": "business", "step": "template"},
    )
    put = client.put(
        "/studio/profile",
        json={"goal": "invoice", "step": "dashboard", "products": []},
    )
    assert put.status_code == 200
    assert put.json()["goal"] == "invoice"
    assert put.json()["step"] == "dashboard"
    assert put.json()["products"] == []


def test_business_sell_goes_to_products():
    client.get("/studio/profile")
    put = client.put(
        "/studio/profile",
        json={
            "path": "business",
            "step": "products",
            "goal": "sell",
            "products": [],
        },
    )
    assert put.status_code == 200
    assert put.json()["goal"] == "sell"
    assert put.json()["step"] == "products"


def test_back_to_user_type_clears_path():
    client.get("/studio/profile")
    client.put(
        "/studio/profile",
        json={"path": "business", "step": "template", "products": []},
    )
    back = client.put(
        "/studio/profile",
        json={"path": None, "step": "user_type", "goal": None},
    )
    assert back.status_code == 200
    assert back.json()["path"] is None
    assert back.json()["step"] == "user_type"
    assert back.json()["goal"] is None


def test_session_cookie_is_lax_and_insecure_in_development():
    """Local dev goes through the same-origin proxy: Lax + non-secure works
    over http and matches the same-origin fetch pattern (#135 follow-up)."""
    import monnify_studio.api.main as main_mod

    original = main_mod.settings.studio_env
    main_mod.settings.studio_env = "development"
    try:
        c = TestClient(app)
        c.cookies.clear()
        res = c.get("/studio/profile")
        cookie_header = res.headers.get("set-cookie", "")
        assert "samesite=lax" in cookie_header.lower()
        assert "secure" not in cookie_header.lower()
    finally:
        main_mod.settings.studio_env = original


def test_session_cookie_is_none_and_secure_outside_development():
    """Production is genuinely cross-origin (web and api are separate Cloud
    Run services): SameSite=Lax is never attached to a cross-site fetch, which
    silently reset onboarding path/goal/step past the first call. Must be
    SameSite=None (only valid alongside Secure) (#135 follow-up)."""
    import monnify_studio.api.main as main_mod

    original = main_mod.settings.studio_env
    main_mod.settings.studio_env = "production"
    try:
        c = TestClient(app)
        c.cookies.clear()
        res = c.get("/studio/profile")
        cookie_header = res.headers.get("set-cookie", "")
        assert "samesite=none" in cookie_header.lower()
        assert "secure" in cookie_header.lower()
    finally:
        main_mod.settings.studio_env = original
