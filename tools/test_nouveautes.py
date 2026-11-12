"""Tests de tools/nouveautes.py : python3 tools/test_nouveautes.py"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
import nouveautes  # noqa: E402

os.chdir(os.path.join(os.path.dirname(__file__), ".."))
sauve = open("src/lib/nouveautes.json", encoding="utf-8").read()
try:
    with tempfile.TemporaryDirectory() as d:
        n1 = {"fr": ["Une nouveauté."], "en": ["Something new."]}
        v1 = nouveautes.preparer("0.1.1", None, d, notes=n1, aujourd_hui="2026-11-13")
        assert v1["notes"] == n1 and [h["version"] for h in v1["history"]] == ["0.1.1", "0.1.0"]
        assert v1["fichiers"]["android"].endswith("/v0.1.1/Sesame-Android.apk")
        prec = os.path.join(d, "latest.json")
        # Même texte que la version précédente : message par défaut, historique allongé
        v2 = nouveautes.preparer("0.1.2", prec, d, notes=n1, aujourd_hui="2026-11-14")
        assert v2["notes"] == nouveautes.PAR_DEFAUT, v2["notes"]
        assert [h["version"] for h in v2["history"]] == ["0.1.2", "0.1.1", "0.1.0"]
        # Republier la même version ne la duplique pas
        v3 = nouveautes.preparer("0.1.2", os.path.join(d, "latest.json"), d, notes={"fr": ["Autre."], "en": ["Other."]})
        assert [h["version"] for h in v3["history"]] == ["0.1.2", "0.1.1", "0.1.0"]
        assert "## EN" in open(os.path.join(d, "release-body.md"), encoding="utf-8").read()
    lues = nouveautes.lire_notes()
    assert lues["fr"] and lues["en"], "NOUVEAUTES.md doit avoir des puces FR et EN"
    print("ok")
finally:
    open("src/lib/nouveautes.json", "w", encoding="utf-8").write(sauve)
