"""
===================================================================
MIDNIGHT CINEMA — VERCEL BUILD STEP

Runs automatically during `vercel deploy` / `vercel dev` (wired up
via pyproject.toml's [tool.vercel.scripts] build). Not needed for
local development outside Vercel -- frontend/ is served directly by
whatever static server you use there (Live Server, `python -m
http.server`, etc).

Vercel serves static assets straight from a `public/` directory at
the project root via its CDN, ahead of the Python function -- see
https://vercel.com/docs/frameworks/backend/flask#serving-static-assets.
frontend/ stays the one place you edit HTML/CSS/JS; this script just
mirrors it into public/ on every deploy so both stay in sync without
duplicated files to maintain by hand.
===================================================================
"""

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "frontend"
DEST = ROOT / "public"


def main():
    if not SOURCE.exists():
        raise SystemExit(f"Expected {SOURCE} to exist -- nothing to build.")

    if DEST.exists():
        shutil.rmtree(DEST)

    shutil.copytree(SOURCE, DEST)

    print(f"Copied {SOURCE} -> {DEST}")


if __name__ == "__main__":
    main()