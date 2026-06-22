"""
recommend.py — entrypoint for the offline recommender.

    python recommend.py             # build models + write recommendations table
    python recommend.py --evaluate  # print offline accuracy metrics (no writes)

This script is decoupled from the backend: it reads the same MySQL database,
computes per-user recommendations, upserts them into `recommendations`, and
exits. The Fastify backend only ever READS that table.
"""
import os
import argparse

from dotenv import load_dotenv

import data as data_mod
from content import ContentModel
from collaborative import ItemCF, SVDModel
from hybrid import HybridRecommender
from writer import write_recommendations

load_dotenv()


def build_and_write(conn):
    bundle = data_mod.load_all(conn)
    matrix = bundle["matrix"]
    books_df = bundle["books_df"]

    if books_df.empty:
        print("No books in catalog — nothing to recommend.")
        return

    print(f"interactions: {bundle['interactions'].shape[0]} rows | "
          f"matrix: {matrix.shape[0]} users x {matrix.shape[1]} books | "
          f"catalog: {books_df.shape[0]} books")

    content = ContentModel(books_df)
    item_cf = ItemCF(matrix, bundle["book_ids_in_matrix"]) if matrix.shape[1] > 1 else None
    svd = SVDModel(matrix, bundle["users"], bundle["book_ids_in_matrix"]) \
        if matrix.shape[0] > 1 and matrix.shape[1] > 1 else None

    top_n = int(os.getenv("TOP_N", "20"))
    w_cf = float(os.getenv("W_CF", "0.6"))
    w_content = float(os.getenv("W_CONTENT", "0.4"))
    rec = HybridRecommender(bundle, content, item_cf, svd,
                            w_cf=w_cf, w_content=w_content, top_n=top_n)

    # Generate for every active user (those with interactions get personalized
    # results; everyone else still gets a popularity-based fallback row set).
    all_users = _all_active_users(conn)
    user_recs = {uid: rec.recommend_for_user(uid) for uid in all_users}

    written = write_recommendations(conn, user_recs)
    personalized = sum(1 for r in user_recs.values()
                       if r and r[0]["algorithm"] != "popularity")
    print(f"wrote {written} recommendation rows for {len(all_users)} users "
          f"({personalized} personalized).")


def _all_active_users(conn):
    df = data_mod._query_df(conn, """
        SELECT id FROM users WHERE deleted_at IS NULL AND is_active = 1
    """)
    return df["id"].tolist() if not df.empty else []


def main():
    parser = argparse.ArgumentParser(description="Library recommender batch job")
    parser.add_argument("--evaluate", action="store_true",
                        help="print offline accuracy metrics instead of writing")
    args = parser.parse_args()

    conn = data_mod.get_connection()
    try:
        if args.evaluate:
            import evaluate as eval_mod
            eval_mod.evaluate(conn)
        else:
            build_and_write(conn)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
