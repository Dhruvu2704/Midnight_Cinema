from flask import Flask, request, jsonify
from flask_cors import CORS

from recommender import recommend
from tmdb_service import get_movie_data


app = Flask(__name__)

CORS(app)


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