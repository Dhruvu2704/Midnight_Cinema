from pathlib import Path

import pandas as pd
from ast import literal_eval
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# -----------------------------------------
# 1. LOAD CLEANED DATASET
# -----------------------------------------

# Resolved relative to this file (backend/recommender.py), not the
# process's current working directory -- a plain "data/processed/..."
# relative path only worked locally because Flask happened to be
# started from the repo root. On Vercel the working directory isn't
# guaranteed, so this must be module-relative instead.
DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "processed" / "movies.csv"

movies = pd.read_csv(DATA_PATH)


# -----------------------------------------
# 2. CONVERT STRING LISTS BACK INTO LISTS
# -----------------------------------------

def convert_to_list(value):
    try:
        return literal_eval(value)
    except (ValueError, SyntaxError):
        return []


movies["genres"] = movies["genres"].apply(convert_to_list)
movies["keywords"] = movies["keywords"].apply(convert_to_list)
movies["cast"] = movies["cast"].apply(convert_to_list)


# -----------------------------------------
# 3. CREATE A COMBINED FEATURE
# -----------------------------------------

def create_tags(row):

    overview = str(row["overview"])

    genres = " ".join(row["genres"])
    keywords = " ".join(row["keywords"])
    cast = " ".join(row["cast"])

    director = str(row["director"])

    return (
        overview + " " +
        genres + " " +
        keywords + " " +
        cast + " " +
        director
    )


movies["tags"] = movies.apply(create_tags, axis=1)


# -----------------------------------------
# 4. CLEAN TAGS
# -----------------------------------------

movies["tags"] = movies["tags"].fillna("").str.lower()


# -----------------------------------------
# 5. TF-IDF VECTORIZATION
# -----------------------------------------

tfidf = TfidfVectorizer(
    stop_words="english",
    max_features=50000
)

tfidf_matrix = tfidf.fit_transform(
    movies["tags"]
)


# -----------------------------------------
# 6. CALCULATE COSINE SIMILARITY
# -----------------------------------------

similarity_matrix = cosine_similarity(
    tfidf_matrix
)


# -----------------------------------------
# 7. CREATE MOVIE INDEX
# -----------------------------------------

movie_indices = pd.Series(
    movies.index,
    index=movies["title"].str.lower()
).drop_duplicates()


# -----------------------------------------
# 8. RECOMMENDATION FUNCTION
# -----------------------------------------

def recommend(movie_title, number_of_recommendations=5):

    movie_title = movie_title.lower().strip()

    if movie_title not in movie_indices:
        return []

    movie_index = movie_indices[movie_title]

    similarity_scores = list(
        enumerate(similarity_matrix[movie_index])
    )

    similarity_scores = sorted(
        similarity_scores,
        key=lambda x: x[1],
        reverse=True
    )

    similarity_scores = similarity_scores[1:number_of_recommendations + 1]

    recommendations = []

    for index, score in similarity_scores:

        movie = movies.iloc[index]

        recommendations.append({
            "movie_id": int(movie["movie_id"]),
            "title": movie["title"],
            "release_year": movie["release_year"],
            "rating": movie["vote_average"],
            "popularity": movie["popularity"],
            "similarity_score": round(float(score), 3)
        })

    return recommendations


# -----------------------------------------
# 9. TEST THE MODEL
# -----------------------------------------

if __name__ == "__main__":

    movie = "Men In Black"

    results = recommend(movie)

    print(f"\nRecommendations for: {movie}\n")

    for i, result in enumerate(results, start=1):

        print(
            f"{i}. {result['title']} "
            f"({result['release_year']}) "
            f"- Rating: {result['rating']} "
            f"- Similarity: {result['similarity_score']}"
        )