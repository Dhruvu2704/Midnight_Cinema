import pandas as pd
import ast
import os


# -----------------------------------------
# 1. LOAD DATASETS
# -----------------------------------------

movies_path = "data/raw/tmdb_5000_movies.csv"
credits_path = "data/raw/tmdb_5000_credits.csv"

movies = pd.read_csv(movies_path)
credits = pd.read_csv(credits_path)

print("Movies dataset:", movies.shape)
print("Credits dataset:", credits.shape)


# -----------------------------------------
# 2. MERGE DATASETS
# -----------------------------------------

movies = movies.merge(
    credits,
    left_on="id",
    right_on="movie_id"
)

print("Merged dataset:", movies.shape)


# -----------------------------------------
# 3. SELECT USEFUL COLUMNS
# -----------------------------------------

movies = movies[
    [
        "id",
        "title_x",
        "overview",
        "genres",
        "keywords",
        "cast",
        "crew",
        "release_date",
        "runtime",
        "vote_average",
        "vote_count",
        "popularity"
    ]
]

movies.rename(
    columns={
        "id": "movie_id",
        "title_x": "title"
    },
    inplace=True
)


# -----------------------------------------
# 4. CONVERT JSON-LIKE TEXT INTO LISTS
# -----------------------------------------

def parse_data(text):
    try:
        return ast.literal_eval(text)
    except (ValueError, SyntaxError):
        return []


# -----------------------------------------
# 5. EXTRACT GENRES
# -----------------------------------------

def get_genres(text):
    data = parse_data(text)

    return [
        item["name"].replace(" ", "")
        for item in data
    ]


movies["genres"] = movies["genres"].apply(get_genres)


# -----------------------------------------
# 6. EXTRACT KEYWORDS
# -----------------------------------------

def get_keywords(text):
    data = parse_data(text)

    return [
        item["name"].replace(" ", "")
        for item in data
    ]


movies["keywords"] = movies["keywords"].apply(get_keywords)


# -----------------------------------------
# 7. EXTRACT TOP CAST
# -----------------------------------------

def get_cast(text):
    data = parse_data(text)

    return [
        item["name"].replace(" ", "")
        for item in data[:5]
    ]


movies["cast"] = movies["cast"].apply(get_cast)


# -----------------------------------------
# 8. EXTRACT DIRECTOR
# -----------------------------------------

def get_director(text):
    data = parse_data(text)

    for item in data:
        if item.get("job") == "Director":
            return item["name"].replace(" ", "")

    return ""


movies["director"] = movies["crew"].apply(get_director)


# -----------------------------------------
# 9. REMOVE CREW COLUMN
# -----------------------------------------

movies.drop(columns=["crew"], inplace=True)


# -----------------------------------------
# 10. HANDLE MISSING VALUES
# -----------------------------------------

movies["overview"] = movies["overview"].fillna("")
movies["genres"] = movies["genres"].apply(
    lambda x: x if isinstance(x, list) else []
)
movies["keywords"] = movies["keywords"].apply(
    lambda x: x if isinstance(x, list) else []
)
movies["cast"] = movies["cast"].apply(
    lambda x: x if isinstance(x, list) else []
)
movies["director"] = movies["director"].fillna("")


# -----------------------------------------
# 11. EXTRACT RELEASE YEAR
# -----------------------------------------

movies["release_date"] = pd.to_datetime(
    movies["release_date"],
    errors="coerce"
)

movies["release_year"] = movies["release_date"].dt.year

movies.drop(columns=["release_date"], inplace=True)


# -----------------------------------------
# 12. REMOVE DUPLICATES
# -----------------------------------------

movies.drop_duplicates(
    subset="movie_id",
    inplace=True
)


# -----------------------------------------
# 13. RESET INDEX
# -----------------------------------------

movies.reset_index(drop=True, inplace=True)


# -----------------------------------------
# 14. CREATE PROCESSED DIRECTORY
# -----------------------------------------

os.makedirs(
    "data/processed",
    exist_ok=True
)


# -----------------------------------------
# 15. SAVE CLEAN DATASET
# -----------------------------------------

output_path = "data/processed/movies.csv"

movies.to_csv(
    output_path,
    index=False
)


# -----------------------------------------
# 16. DISPLAY RESULTS
# -----------------------------------------

print("\nDataset cleaning completed!")

print("Final dataset:", movies.shape)

print("\nColumns:")
print(movies.columns.tolist())

print("\nFirst 5 movies:")
print(movies.head())

print("\nSaved to:")
print(output_path)