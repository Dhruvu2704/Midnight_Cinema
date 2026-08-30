"""
===================================================================
MIDNIGHT CINEMA — VERCEL ENTRY POINT

Thin wrapper only. The real Flask application, database, auth,
watchlist, recommender, and TMDB code all stay exactly where they
already live in backend/ -- nothing is duplicated here.

Referenced by pyproject.toml's [tool.vercel] entrypoint
("backend.vercel_app:app") and by vercel.json's "functions" key
("backend/vercel_app.py"), so Vercel loads this module and serves
the `app` object below as a single Vercel Function.

Why this file needs to exist at all: app.py and its sibling modules
(recommender.py, tmdb_service.py, database.py, auth.py,
watchlist.py) import each other with plain top-level names, e.g.
`from database import db, User`. That only resolves if the
backend/ directory itself is on sys.path -- true when you run
`python app.py` from inside backend/ locally, but NOT true when
Vercel imports this file as the dotted module "backend.vercel_app".
Adding backend/'s own directory to sys.path here, before importing
app.py, makes those same imports resolve identically in both
places, so nothing inside app.py (or any module it imports) needs
to change.
===================================================================
"""

import os
import sys

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import app  # noqa: E402  (import after sys.path fix, by design)

__all__ = ["app"]