"""
===================================================================
MIDNIGHT CINEMA — DATABASE
SQLAlchemy models for Users and Watchlist items.

USERS
    ↓ (users.id → watchlist.user_id)
WATCHLIST

The database is the single source of truth for the watchlist.
localStorage is no longer used for persistence.

Local development uses a SQLite file next to this module, same as
before. Vercel's filesystem is read-only and ephemeral between
invocations, so production requires a real hosted database instead
-- set DATABASE_URL (a Postgres connection string) and this module
uses that automatically.
===================================================================
"""

import json
import os
from datetime import datetime

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


# =========================================================
# USERS
# =========================================================

class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)

    username = db.Column(db.String(64), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    watchlist_items = db.relationship(
        "WatchlistItem",
        backref="user",
        lazy=True,
        cascade="all, delete-orphan"
    )

    def to_public_dict(self):
        """Never include password_hash — this is what the frontend sees."""
        return {
            "id": self.id,
            "name": self.username,
            "email": self.email
        }


# =========================================================
# WATCHLIST
# =========================================================

class WatchlistItem(db.Model):
    __tablename__ = "watchlist"

    id = db.Column(db.Integer, primary_key=True)

    user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.id"),
        nullable=False,
        index=True
    )

    movie_id = db.Column(db.Integer, nullable=False)

    # Enough movie data to render the watchlist card without
    # re-hitting TMDB or the recommender for every saved film.
    title = db.Column(db.String(255))
    poster_url = db.Column(db.String(500))
    backdrop_url = db.Column(db.String(500))
    release_year = db.Column(db.String(16))
    release_date = db.Column(db.String(32))
    rating = db.Column(db.Float)
    runtime = db.Column(db.Integer)
    similarity_score = db.Column(db.Float)
    overview = db.Column(db.Text)
    genres = db.Column(db.Text)  # stored as a JSON string

    trailer_name = db.Column(db.String(255))
    trailer_key = db.Column(db.String(64))
    trailer_url = db.Column(db.String(500))

    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        db.UniqueConstraint("user_id", "movie_id", name="uq_user_movie"),
    )

    def to_dict(self):
        try:
            genres = json.loads(self.genres) if self.genres else []
        except (TypeError, ValueError):
            genres = []

        trailer = None
        if self.trailer_key:
            trailer = {
                "name": self.trailer_name,
                "key": self.trailer_key,
                "url": self.trailer_url
            }

        return {
            "movie_id": self.movie_id,
            "title": self.title,
            "poster_url": self.poster_url,
            "backdrop_url": self.backdrop_url,
            "release_year": self.release_year,
            "release_date": self.release_date,
            "rating": self.rating,
            "runtime": self.runtime,
            "similarity_score": self.similarity_score,
            "overview": self.overview,
            "genres": genres,
            "trailer": trailer,
            "added_at": self.created_at.isoformat() if self.created_at else None
        }


# =========================================================
# CONNECTION STRING
# =========================================================

def _resolve_database_uri(app):
    """
    DATABASE_URL (set on Vercel to a hosted Postgres connection
    string) always wins. Falls back to the local SQLite file when
    it isn't set, so local development is unchanged.
    """

    database_url = os.getenv("DATABASE_URL")

    if database_url:
        # SQLAlchemy 2.x / psycopg2 require the "postgresql://"
        # scheme; some providers (Neon, Heroku-style URLs) still
        # hand out the older "postgres://" form.
        if database_url.startswith("postgres://"):
            database_url = "postgresql://" + database_url[len("postgres://"):]

        return database_url

    return "sqlite:///" + os.path.join(app.root_path, "midnight_cinema.db")


# =========================================================
# INITIALIZATION
# =========================================================

def init_db(app):
    """
    Binds SQLAlchemy to the Flask app and creates any tables that
    don't exist yet. Safe to call every time the app starts --
    create_all() only creates missing tables; it never drops or
    recreates existing ones, so it never touches existing users or
    watchlists.
    """
    app.config["SQLALCHEMY_DATABASE_URI"] = _resolve_database_uri(app)

    # pool_pre_ping avoids handing out a connection that a hosted
    # Postgres provider has already closed for being idle, which
    # happens often between Vercel's serverless invocations.
    app.config.setdefault("SQLALCHEMY_ENGINE_OPTIONS", {"pool_pre_ping": True})

    db.init_app(app)

    with app.app_context():
        db.create_all()