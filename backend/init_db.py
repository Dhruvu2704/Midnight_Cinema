"""
===================================================================
MIDNIGHT CINEMA — DATABASE INITIALIZATION

Optional convenience script. The database also initializes itself
automatically on `python app.py`, so you only need to run this if
you want to create the tables without starting the server.

Usage:
    python init_db.py
===================================================================
"""

from app import app
from database import init_db

if __name__ == "__main__":
    init_db(app)
    print("Midnight Cinema database is ready (midnight_cinema.db).")