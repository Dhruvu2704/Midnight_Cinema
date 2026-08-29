import os
import time
import requests
from dotenv import load_dotenv


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv()

TMDB_BASE_URL = "https://api.themoviedb.org/3"
TMDB_IMAGE_BASE_URL = "https://image.tmdb.org/t/p"

TMDB_API_TOKEN = os.getenv("TMDB_API_TOKEN")


# =========================================================
# SESSION
# =========================================================

session = requests.Session()

session.headers.update({
    "Authorization": f"Bearer {TMDB_API_TOKEN}",
    "accept": "application/json",
    "User-Agent": "MidnightCinema/1.0"
})


# =========================================================
# AUTHENTICATION CHECK
# =========================================================

def check_configuration():

    if not TMDB_API_TOKEN:
        raise RuntimeError(
            "TMDB_API_TOKEN is not configured. "
            "Check your .env file."
        )


# =========================================================
# TMDB REQUEST HELPER
# =========================================================

def tmdb_get(endpoint, params=None):

    check_configuration()

    url = f"{TMDB_BASE_URL}{endpoint}"

    last_error = None

    for attempt in range(3):

        try:

            response = session.get(
                url,
                params=params,
                timeout=(10, 30)
            )

            response.raise_for_status()

            return response.json()

        except requests.exceptions.RequestException as error:

            last_error = error

            if attempt < 2:
                time.sleep(1)

    raise RuntimeError(
        f"TMDB request failed after 3 attempts: {last_error}"
    )


# =========================================================
# MOVIE DETAILS
# =========================================================

def get_movie_details(movie_id):

    return tmdb_get(
        f"/movie/{movie_id}"
    )


# =========================================================
# MOVIE VIDEOS
# =========================================================

def get_movie_videos(movie_id):

    try:

        return tmdb_get(
            f"/movie/{movie_id}/videos"
        )

    except RuntimeError:

        # Videos are useful but not essential.
        # If TMDB video data fails, don't destroy
        # the entire movie response.

        return {
            "results": []
        }


# =========================================================
# FIND TRAILER
# =========================================================

def get_trailer(videos):

    results = videos.get("results", [])

    # First preference:
    # Official YouTube trailer

    for video in results:

        if (
            video.get("site") == "YouTube"
            and video.get("type") == "Trailer"
            and video.get("official") is True
        ):

            return {
                "name": video.get("name"),
                "key": video.get("key"),
                "url": f"https://www.youtube.com/watch?v={video.get('key')}"
            }

    # Second preference:
    # Any YouTube trailer

    for video in results:

        if (
            video.get("site") == "YouTube"
            and video.get("type") == "Trailer"
        ):

            return {
                "name": video.get("name"),
                "key": video.get("key"),
                "url": f"https://www.youtube.com/watch?v={video.get('key')}"
            }

    return None


# =========================================================
# IMAGE URL BUILDER
# =========================================================

def build_image_url(path, size="w500"):

    if not path:
        return None

    return f"{TMDB_IMAGE_BASE_URL}/{size}{path}"


# =========================================================
# COMPLETE MOVIE DATA
# =========================================================

def get_movie_data(movie_id):

    details = get_movie_details(movie_id)

    videos = get_movie_videos(movie_id)

    trailer = get_trailer(videos)

    return {

        "movie_id": details.get("id"),

        "title": details.get("title"),

        "original_title": details.get(
            "original_title"
        ),

        "overview": details.get(
            "overview"
        ),

        "release_date": details.get(
            "release_date"
        ),

        "runtime": details.get(
            "runtime"
        ),

        "rating": details.get(
            "vote_average"
        ),

        "vote_count": details.get(
            "vote_count"
        ),

        "popularity": details.get(
            "popularity"
        ),

        "genres": [
            genre.get("name")
            for genre in details.get(
                "genres",
                []
            )
        ],

        "poster_path": details.get(
            "poster_path"
        ),

        "poster_url": build_image_url(
            details.get("poster_path"),
            "w500"
        ),

        "backdrop_path": details.get(
            "backdrop_path"
        ),

        "backdrop_url": build_image_url(
            details.get("backdrop_path"),
            "w1280"
        ),

        "trailer": trailer
    }


# =========================================================
# TEST
# =========================================================

if __name__ == "__main__":

    print("\n===================================")
    print("      MIDNIGHT CINEMA")
    print("      TMDB CONNECTION TEST")
    print("===================================\n")

    movie_id = 157336

    print("Testing movie ID:", movie_id)
    print("Connecting to TMDB...\n")

    try:

        movie = get_movie_data(movie_id)

        print("TMDB CONNECTION SUCCESSFUL\n")

        print("Title:")
        print(movie["title"])

        print("\nRelease Date:")
        print(movie["release_date"])

        print("\nRating:")
        print(movie["rating"])

        print("\nGenres:")
        print(", ".join(movie["genres"]))

        print("\nPoster:")
        print(movie["poster_url"])

        print("\nBackdrop:")
        print(movie["backdrop_url"])

        print("\nTrailer:")

        if movie["trailer"]:
            print(movie["trailer"]["url"])
        else:
            print("No trailer found.")

        print("\n===================================")
        print("              DONE")
        print("===================================\n")

    except Exception as error:

        print("\nTMDB CONNECTION FAILED\n")
        print(error)