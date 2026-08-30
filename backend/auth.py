"""
===================================================================
MIDNIGHT CINEMA — AUTHENTICATION
Register / login / logout / current-user, backed by secure
server-side sessions (Flask's signed session cookie) and salted
password hashing (Werkzeug's generate_password_hash / PBKDF2).

Nothing here trusts a user_id from the frontend — the authenticated
user is always read from the session.
===================================================================
"""

import re
from functools import wraps

from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash

from database import db, User

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")

EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

MIN_PASSWORD_LENGTH = 8


# =========================================================
# LOGIN-REQUIRED DECORATOR
# =========================================================

def login_required(view_func):
    """
    Protects a route so it only runs for an authenticated session.
    The current user's id is always read from the server-side
    session — never from anything the client supplies.
    """

    @wraps(view_func)
    def wrapped(*args, **kwargs):

        if not session.get("user_id"):
            return jsonify({
                "error": "Your session has ended. Please sign in again."
            }), 401

        return view_func(*args, **kwargs)

    return wrapped


# =========================================================
# REGISTER
# =========================================================

@auth_bp.route("/register", methods=["POST"])
def register():

    data = request.get_json(silent=True) or {}

    username = (data.get("username") or data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    confirm_password = data.get("confirm_password") or data.get("confirmPassword") or ""

    # -----------------------------------------
    # Required fields
    # -----------------------------------------

    if not username or not email or not password or not confirm_password:
        return jsonify({
            "error": "Every field is required to join the archive."
        }), 400

    # -----------------------------------------
    # Email format
    # -----------------------------------------

    if not EMAIL_PATTERN.match(email):
        return jsonify({
            "error": "Please enter a valid email."
        }), 400

    # -----------------------------------------
    # Password confirmation
    # -----------------------------------------

    if password != confirm_password:
        return jsonify({
            "error": "The passwords don't match."
        }), 400

    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({
            "error": f"Passwords must be at least {MIN_PASSWORD_LENGTH} characters."
        }), 400

    # -----------------------------------------
    # Duplicate checks
    # -----------------------------------------

    if User.query.filter_by(email=email).first():
        return jsonify({
            "error": "That email already belongs to a member of the archive."
        }), 409

    if User.query.filter_by(username=username).first():
        return jsonify({
            "error": "That name is already taken in the archive."
        }), 409

    # -----------------------------------------
    # Create the user
    # -----------------------------------------

    user = User(
        username=username,
        email=email,
        password_hash=generate_password_hash(password)
    )

    db.session.add(user)
    db.session.commit()

    # Log the new member straight into a session.
    session.clear()
    session["user_id"] = user.id
    session.permanent = True

    return jsonify({
        "authenticated": True,
        "user": user.to_public_dict()
    }), 201


# =========================================================
# LOGIN
# =========================================================

@auth_bp.route("/login", methods=["POST"])
def login():

    data = request.get_json(silent=True) or {}

    identifier = (
        data.get("identifier")
        or data.get("email")
        or data.get("username")
        or ""
    ).strip().lower()

    password = data.get("password") or ""

    if not identifier or not password:
        return jsonify({
            "error": "The archive couldn't verify those credentials."
        }), 400

    user = User.query.filter(
        db.or_(
            db.func.lower(User.email) == identifier,
            db.func.lower(User.username) == identifier
        )
    ).first()

    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({
            "error": "The archive couldn't verify those credentials."
        }), 401

    session.clear()
    session["user_id"] = user.id
    session.permanent = True

    return jsonify({
        "authenticated": True,
        "user": user.to_public_dict()
    })


# =========================================================
# LOGOUT
# =========================================================

@auth_bp.route("/logout", methods=["POST"])
def logout():

    session.clear()

    return jsonify({
        "authenticated": False
    })


# =========================================================
# CURRENT USER
# =========================================================

@auth_bp.route("/me", methods=["GET"])
def me():

    user_id = session.get("user_id")

    if not user_id:
        return jsonify({
            "authenticated": False
        })

    user = User.query.get(user_id)

    if not user:
        # Stale session pointing at a deleted user.
        session.clear()
        return jsonify({
            "authenticated": False
        })

    return jsonify({
        "authenticated": True,
        "user": user.to_public_dict()
    })