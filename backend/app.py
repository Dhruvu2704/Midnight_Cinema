import os
from datetime import timedelta

from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

from recommender import recommend
from tmdb_service import get_movie_data
from database import init_db
from auth import auth_bp
from watchlist import watchlist_bp


load_dotenv()

app = Flask(__name__)


# =========================================================
# CONFIGURATION
# =========================================================

# Used to sign the session cookie. Set a real value in .env for
# anything beyond local development.
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-key-change-me")

# SQLite database file, created alongside this app.
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(
    app.root_path, "midnight_cinema.db"
)
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

# Session / cookie behaviour.
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=14)


# =========================================================
# CORS
# =========================================================

# The frontend and Flask run on different local ports during
# development, so cookies need `supports_credentials=True` plus an
# explicit origin allowlist (credentialed requests can't use "*").
# Add your deployed frontend origin via ALLOWED_ORIGINS in .env,
# comma-separated, e.g. "https://midnightcinema.example.com".
default_origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:5000",
    "http://localhost:5000",
    "http://127.0.0.1:8000",
    "http://localhost:8000"
]

extra_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

CORS(
    app,
    supports_credentials=True,
    origins=default_origins + extra_origins
)


# =========================================================
# DATABASE
# =========================================================

init_db(app)


# =========================================================
# BLUEPRINTS
# =========================================================

app.register_blueprint(auth_bp)
app.register_blueprint(watchlist_bp)


# =========================================================
# HOME
# =========================================================

@app.route("/")
def home():

    return jsonify({
        "message": "Midnight Cinema API is running!"
    })


# =========================================================
# RECOMMENDATIONS
# =========================================================

@app.route("/recommend", methods=["GET"])
def get_recommendations():

    movie_title = request.args.get("movie")

    # -----------------------------------------
    # Validate input
    # -----------------------------------------

    if not movie_title:

        return jsonify({
            "error": "Movie title is required."
        }), 400


    # -----------------------------------------
    # Get recommendations from ML model
    # -----------------------------------------

    recommendations = recommend(movie_title)

    if not recommendations:

        return jsonify({
            "error": "Movie not found in the recommendation database."
        }), 404


    # -----------------------------------------
    # Enrich recommendations with TMDB data
    # -----------------------------------------

    enriched_recommendations = []


    for movie in recommendations:

        movie_data = movie.copy()

        try:

            tmdb_data = get_movie_data(
                movie["movie_id"]
            )

            movie_data.update({

                "poster_url":
                    tmdb_data.get("poster_url"),

                "backdrop_url":
                    tmdb_data.get("backdrop_url"),

                "overview":
                    tmdb_data.get("overview"),

                "release_date":
                    tmdb_data.get("release_date"),

                "runtime":
                    tmdb_data.get("runtime"),

                "genres":
                    tmdb_data.get("genres", []),

                "trailer":
                    tmdb_data.get("trailer")

            })

        except Exception as error:

            print(
                f"TMDB error for "
                f"{movie.get('title')}: {error}"
            )

            # Keep the recommendation even if
            # TMDB fails for one movie.

            movie_data.update({

                "poster_url": None,
                "backdrop_url": None,
                "overview": None,
                "release_date": None,
                "runtime": None,
                "genres": [],
                "trailer": None

            })


        enriched_recommendations.append(
            movie_data
        )


    # -----------------------------------------
    # Final response
    # -----------------------------------------

    return jsonify({

        "movie": movie_title,

        "recommendations":
            enriched_recommendations

    })


# =========================================================
# RUN SERVER
# =========================================================

if __name__ == "__main__":

    app.run(
        debug=True,
        port=5000
    )