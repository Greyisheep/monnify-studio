"""Moni is grounded in the Monnify cheat sheet, not training memory (#25)."""

from __future__ import annotations

from monnify_studio.ai.composer import _catalog_prompt, _clean
from monnify_studio.providers import default_catalog


def test_every_monnify_node_carries_cheatsheet_grounding():
    catalog = default_catalog()
    for tid in catalog.types():
        d = catalog.resolve(tid)
        if d.type.startswith("monnify."):
            assert d.when_to_use, f"{d.type} missing when_to_use"
            assert d.doc_url.startswith("https://developers.monnify.com"), d.type


def test_prompt_feeds_documented_language_and_doc_links():
    prompt = _catalog_prompt(default_catalog())
    # Phrases lifted from the cheat sheet, proving she reads Monnify's words.
    assert "up to 5,000 payouts" in prompt  # bulk transfer
    assert "Name Enquiry" in prompt  # validate bank account
    assert "https://developers.monnify.com" in prompt  # doc links present


def test_prompt_never_leaks_internal_breadcrumbs():
    prompt = _catalog_prompt(default_catalog())
    for noise in ("(#54", "D17 tier-1", "mock execution only for now", "(D10)", "(#24)"):
        assert noise not in prompt, f"internal ref leaked to the model: {noise}"


def test_clean_strips_refs_but_keeps_meaning():
    assert _clean("Rows from a sheet. Canvas + mock execution only for now (#54, D17).") == (
        "Rows from a sheet."
    )
    assert _clean("Split at payment time (D10).") == "Split at payment time."
