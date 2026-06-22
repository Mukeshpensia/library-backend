"""
data.py — load + preprocess from MySQL into an interaction matrix + book features.

Builds two things the models need:
  1. A sparse user x book *interaction matrix* from weighted implicit/explicit signals.
  2. A *book feature* table (text + categories + authors) for the content model.

Signal weights (see ai-CLAUDE.md §4):
  - book_ratings.rating  -> explicit, use the rating value (1-5)
  - borrows              -> implicit positive, weight 3 per borrow (copy mapped to book)
  - favorites            -> implicit positive, weight 4
  - book_views           -> weak implicit positive, weight 1 (capped per user/book)

Soft-deleted users/books are excluded everywhere.
"""
import os
import json

import numpy as np
import pandas as pd
import mysql.connector
from scipy.sparse import csr_matrix
from dotenv import load_dotenv

load_dotenv()

# --- signal weights -------------------------------------------------------
W_BORROW = 3.0
W_FAVORITE = 4.0
W_VIEW = 1.0
VIEW_CAP = 5  # cap the weak view signal so a refresh-happy user can't dominate


def get_connection():
    """Open a mysql-connector connection from DB_* env vars (same DB as backend).

    Managed providers (e.g. Aiven) require TLS. We mirror the backend's
    `ssl: { rejectUnauthorized: false }` — TLS on, no CA verification. Set
    DB_SSL=false for a plain local MySQL that doesn't speak TLS.
    """
    kwargs = dict(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", ""),
        database=os.getenv("DB_NAME", "library_db"),
    )
    if os.getenv("DB_SSL", "true").lower() != "false":
        kwargs["ssl_disabled"] = False
        kwargs["ssl_verify_cert"] = False
        kwargs["ssl_verify_identity"] = False
    return mysql.connector.connect(**kwargs)


def _query_df(conn, sql):
    cur = conn.cursor(dictionary=True)
    cur.execute(sql)
    rows = cur.fetchall()
    cur.close()
    return pd.DataFrame(rows)


# --------------------------------------------------------------------------
# Interaction signals
# --------------------------------------------------------------------------
def load_interactions(conn):
    """Return a DataFrame [user_id, book_id, weight] aggregated across all signals."""
    ratings = _query_df(conn, """
        SELECT br.user_id, br.book_id, br.rating AS weight
        FROM book_ratings br
        JOIN users u ON u.id = br.user_id AND u.deleted_at IS NULL
        JOIN books b ON b.id = br.book_id AND b.deleted_at IS NULL
    """)

    borrows = _query_df(conn, f"""
        SELECT b.user_id, bc.book_id, COUNT(*) * {W_BORROW} AS weight
        FROM borrows b
        JOIN book_copies bc ON bc.id = b.book_copy_id
        JOIN users u ON u.id = b.user_id AND u.deleted_at IS NULL
        JOIN books bk ON bk.id = bc.book_id AND bk.deleted_at IS NULL
        GROUP BY b.user_id, bc.book_id
    """)

    favorites = _query_df(conn, f"""
        SELECT f.user_id, f.book_id, COUNT(*) * {W_FAVORITE} AS weight
        FROM favorites f
        JOIN users u ON u.id = f.user_id AND u.deleted_at IS NULL
        JOIN books b ON b.id = f.book_id AND b.deleted_at IS NULL
        GROUP BY f.user_id, f.book_id
    """)

    views = _query_df(conn, f"""
        SELECT bv.user_id, bv.book_id, LEAST(COUNT(*), {VIEW_CAP}) * {W_VIEW} AS weight
        FROM book_views bv
        JOIN users u ON u.id = bv.user_id AND u.deleted_at IS NULL
        JOIN books b ON b.id = bv.book_id AND b.deleted_at IS NULL
        WHERE bv.user_id IS NOT NULL
        GROUP BY bv.user_id, bv.book_id
    """)

    frames = [df for df in (ratings, borrows, favorites, views) if not df.empty]
    if not frames:
        return pd.DataFrame(columns=["user_id", "book_id", "weight"])

    combined = pd.concat(frames, ignore_index=True)
    combined["weight"] = combined["weight"].astype(float)
    return combined.groupby(["user_id", "book_id"], as_index=False)["weight"].sum()


def build_interaction_matrix(interactions):
    """Turn the [user_id, book_id, weight] frame into a sparse user x book CSR matrix.

    Returns (matrix, users, books, user_index, book_index).
    """
    users = interactions["user_id"].unique().tolist()
    books = interactions["book_id"].unique().tolist()
    user_index = {u: i for i, u in enumerate(users)}
    book_index = {b: i for i, b in enumerate(books)}

    rows = interactions["user_id"].map(user_index).to_numpy()
    cols = interactions["book_id"].map(book_index).to_numpy()
    vals = interactions["weight"].to_numpy(dtype=float)

    matrix = csr_matrix((vals, (rows, cols)), shape=(len(users), len(books)))
    return matrix, users, books, user_index, book_index


# --------------------------------------------------------------------------
# Book features (for the content model). Covers the FULL catalog so new books
# with no borrow history are still recommendable.
# --------------------------------------------------------------------------
def _parse_authors(raw):
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(a) for a in raw]
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(a) for a in parsed]
        return [str(parsed)]
    except (TypeError, ValueError):
        return [str(raw)]


def load_books(conn):
    """Return a DataFrame of all non-deleted books with parsed authors + categories."""
    books = _query_df(conn, """
        SELECT b.id, b.title, b.description, b.authors, b.popularity_score
        FROM books b
        WHERE b.deleted_at IS NULL
    """)
    if books.empty:
        return books

    cats = _query_df(conn, """
        SELECT bc.book_id, c.name
        FROM book_categories bc
        JOIN categories c ON c.id = bc.category_id
    """)
    cat_map = {}
    if not cats.empty:
        for book_id, grp in cats.groupby("book_id"):
            cat_map[book_id] = grp["name"].tolist()

    books["authors"] = books["authors"].apply(_parse_authors)
    books["categories"] = books["id"].map(lambda b: cat_map.get(b, []))
    books["title"] = books["title"].fillna("")
    books["description"] = books["description"].fillna("")
    books["popularity_score"] = books["popularity_score"].fillna(0.0).astype(float)
    return books


def load_all(conn):
    """Convenience loader returning everything the pipeline needs."""
    interactions = load_interactions(conn)
    matrix, users, books_idx, user_index, book_index = build_interaction_matrix(interactions)
    books_df = load_books(conn)
    return {
        "interactions": interactions,
        "matrix": matrix,
        "users": users,
        "book_ids_in_matrix": books_idx,
        "user_index": user_index,
        "book_index": book_index,
        "books_df": books_df,
    }


if __name__ == "__main__":
    conn = get_connection()
    try:
        bundle = load_all(conn)
        print("interactions:", bundle["interactions"].shape)
        print("matrix (users x books):", bundle["matrix"].shape)
        print("catalog books:", bundle["books_df"].shape[0])
    finally:
        conn.close()
