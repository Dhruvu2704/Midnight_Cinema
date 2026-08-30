"""
===================================================================
MIDNIGHT CINEMA — WATCHLIST API
Database-backed, per-user watchlist.

GET    /api/watchlist              -> current user's saved films
POST   /api/watchlist               -> save a film for current user
DELETE /api/watchlist/<movie_id>    -> remove a film for current user

The authenticated user is always taken from the session
(see auth.login_required) — never from a value the client sends.
This is what keeps User A's watchlist invisible to User B.
===================================================================
"""

import json

from flask import Blueprint, request, jsonify, session

from database import db, WatchlistItem
from auth import login_required

watchlist_bp = Blueprint("watchlist", __name__, url_prefix="/api/watchlist")


# =========================================================
# GET WATCHLIST
# =========================================================

@watchlist_bp.route("", methods=["GET"])
@login_required
def get_watchlist():

    user_id = session["user_id"]

    items = (
        WatchlistItem.query
        .filter_by(user_id=user_id)
        .order_by(WatchlistItem.created_at.desc())
        .all()
    )

    return jsonify({
        "watchlist": [item.to_dict() for item in items]
    })


# =========================================================
# ADD TO WATCHLIST
# =========================================================

@watchlist_bp.route("", methods=["POST"])
@login_required
def add_to_watchlist():

    user_id = session["user_id"]
    data = request.get_json(silent=True) or {}

    movie_id = data.get("movie_id")

    if movie_id is None:
        return jsonify({
            "error": "movie_id is required."
        }), 400

    try:
        movie_id = int(movie_id)
    except (TypeError, ValueError):
        return jsonify({
            "error": "movie_id must be a number."
        }), 400

    # -----------------------------------------
    # Prevent duplicates for this user
    # -----------------------------------------

    existing = WatchlistItem.query.filter_by(
        user_id=user_id,
        movie_id=movie_id
    ).first()

    if existing:
        return jsonify({
            "message": "That film is already in your archive.",
            "watchlist_item": existing.to_dict()
        }), 200

    trailer = data.get("trailer") or {}
    genres = data.get("genres")

    release_year = data.get("release_year")

    item = WatchlistItem(
        user_id=user_id,
        movie_id=movie_id,
        title=data.get("title"),
        poster_url=data.get("poster_url"),
        backdrop_url=data.get("backdrop_url"),
        release_year=str(release_year) if release_year is not None else None,
        release_date=data.get("release_date"),
        rating=data.get("rating"),
        runtime=data.get("runtime"),
        similarity_score=data.get("similarity_score"),
        overview=data.get("overview"),
        genres=json.dumps(genres if isinstance(genres, list) else []),
        trailer_name=trailer.get("name"),
        trailer_key=trailer.get("key"),
        trailer_url=trailer.get("url")
    )

    db.session.add(item)
    db.session.commit()

    return jsonify({
        "message": "Added to your archive.",
        "watchlist_item": item.to_dict()
    }), 201


# =========================================================
# REMOVE FROM WATCHLIST
# =========================================================

@watchlist_bp.route("/<int:movie_id>", methods=["DELETE"])
@login_required
def remove_from_watchlist(movie_id):

    user_id = session["user_id"]

    item = WatchlistItem.query.filter_by(
        user_id=user_id,
        movie_id=movie_id
    ).first()

    if not item:
        return jsonify({
            "error": "That film isn't in your archive."
        }), 404

    db.session.delete(item)
    db.session.commit()

    return jsonify({
        "message": "Removed from your archive."
    })