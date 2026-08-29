from flask import Flask, request, jsonify
from flask_cors import CORS

from recommender import recommend


app = Flask(__name__)

CORS(app)


@app.route("/")
def home():

    return jsonify({
        "message": "Movie Recommendation API is running!"
    })


@app.route("/recommend", methods=["GET"])
def get_recommendations():

    movie_title = request.args.get("movie")

    if not movie_title:

        return jsonify({
            "error": "Movie title is required"
        }), 400

    recommendations = recommend(movie_title)

    if not recommendations:

        return jsonify({
            "error": "Movie not found"
        }), 404

    return jsonify({
        "movie": movie_title,
        "recommendations": recommendations
    })


if __name__ == "__main__":

    app.run(
        debug=True,
        port=5000
    )