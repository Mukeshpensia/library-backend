"""
evaluate.py — offline accuracy metrics for the project report (run: --evaluate).

Temporal hold-out: for each user we hide their single most-recent interacted
book, train the models on everything before it, then check whether the model
ranks that hidden book into the top-k. Reports precision@k / recall@k (k=5,10)
for the hybrid recommender vs. a popularity baseline, plus RMSE for the SVD
matrix-factorization reconstruction.

These numbers go straight into the report's "AI accuracy testing" section.
"""
import numpy as np
import pandas as pd

import data as data_mod
from content import ContentModel
from collaborative import ItemCF, SVDModel
from hybrid import HybridRecommender, MIN_CF_INTERACTIONS

W_MAP_BORROW = 3.0
W_MAP_FAVORITE = 4.0
W_MAP_VIEW = 1.0


def _load_events(conn):
    """Time-stamped (user_id, book_id, weight, ts) events across all signals."""
    q = data_mod._query_df
    ratings = q(conn, """
        SELECT br.user_id, br.book_id, br.rating AS weight, br.created_at AS ts
        FROM book_ratings br
        JOIN users u ON u.id = br.user_id AND u.deleted_at IS NULL
        JOIN books b ON b.id = br.book_id AND b.deleted_at IS NULL
    """)
    borrows = q(conn, f"""
        SELECT b.user_id, bc.book_id, {W_MAP_BORROW} AS weight, b.issued_at AS ts
        FROM borrows b
        JOIN book_copies bc ON bc.id = b.book_copy_id
        JOIN users u ON u.id = b.user_id AND u.deleted_at IS NULL
        JOIN books bk ON bk.id = bc.book_id AND bk.deleted_at IS NULL
    """)
    favorites = q(conn, f"""
        SELECT f.user_id, f.book_id, {W_MAP_FAVORITE} AS weight, f.created_at AS ts
        FROM favorites f
        JOIN users u ON u.id = f.user_id AND u.deleted_at IS NULL
        JOIN books b ON b.id = f.book_id AND b.deleted_at IS NULL
    """)
    views = q(conn, f"""
        SELECT bv.user_id, bv.book_id, {W_MAP_VIEW} AS weight, bv.viewed_at AS ts
        FROM book_views bv
        JOIN users u ON u.id = bv.user_id AND u.deleted_at IS NULL
        JOIN books b ON b.id = bv.book_id AND b.deleted_at IS NULL
        WHERE bv.user_id IS NOT NULL
    """)
    frames = [df for df in (ratings, borrows, favorites, views) if not df.empty]
    if not frames:
        return pd.DataFrame(columns=["user_id", "book_id", "weight", "ts"])
    events = pd.concat(frames, ignore_index=True)
    events["weight"] = events["weight"].astype(float)
    events["ts"] = pd.to_datetime(events["ts"])
    return events


def _build_models(train_interactions, books_df):
    matrix, users, book_ids, user_index, book_index = data_mod.build_interaction_matrix(train_interactions)
    bundle = {
        "interactions": train_interactions, "matrix": matrix, "users": users,
        "book_ids_in_matrix": book_ids, "user_index": user_index,
        "book_index": book_index, "books_df": books_df,
    }
    content = ContentModel(books_df)
    item_cf = ItemCF(matrix, book_ids) if matrix.shape[1] > 1 else None
    svd = SVDModel(matrix, users, book_ids) if matrix.shape[0] > 1 and matrix.shape[1] > 1 else None
    rec = HybridRecommender(bundle, content, item_cf, svd)
    return rec, svd, book_index


def evaluate(conn, ks=(5, 10)):
    events = _load_events(conn)
    books_df = data_mod.load_books(conn)
    if events.empty or books_df.empty:
        print("Not enough data to evaluate.")
        return

    # Pick hold-out: each user's most recent event whose book also appears
    # earlier in their history excluded — we just hold out the latest book.
    events = events.sort_values("ts")
    test_pairs = []          # (user_id, held_book, held_weight)
    train_rows = []
    for user_id, grp in events.groupby("user_id"):
        distinct_books = grp["book_id"].nunique()
        if distinct_books < 2:
            train_rows.append(grp)   # too small to test; keep fully in train
            continue
        held_book = grp.iloc[-1]["book_id"]
        held_weight = grp.iloc[-1]["weight"]
        test_pairs.append((user_id, held_book, held_weight))
        train_rows.append(grp[grp["book_id"] != held_book])

    if not test_pairs:
        print("No users have enough history for a temporal hold-out.")
        return

    train_events = pd.concat(train_rows, ignore_index=True)
    train_interactions = train_events.groupby(
        ["user_id", "book_id"], as_index=False)["weight"].sum()

    rec, svd, book_index = _build_models(train_interactions, books_df)
    pop_baseline = [b for b, _ in rec.popularity]

    maxk = max(ks)
    hybrid_hits = {k: 0 for k in ks}
    pop_hits = {k: 0 for k in ks}
    sq_err, n_err = 0.0, 0

    for user_id, held_book, held_weight in test_pairs:
        recs = rec.recommend_for_user(user_id)
        ranked_books = [r["book_id"] for r in recs][:maxk]
        for k in ks:
            if held_book in ranked_books[:k]:
                hybrid_hits[k] += 1
            if held_book in pop_baseline[:k]:
                pop_hits[k] += 1

        # RMSE on the SVD reconstruction of the held-out interaction weight.
        if svd is not None and held_book in book_index:
            pred = svd.score_user(user_id).get(held_book, 0.0)
            sq_err += (pred - held_weight) ** 2
            n_err += 1

    n = len(test_pairs)
    print("\n=== Offline evaluation (temporal hold-out) ===")
    print(f"users evaluated: {n}\n")
    header = f"{'metric':<16}{'hybrid':>12}{'popularity':>14}"
    print(header)
    print("-" * len(header))
    for k in ks:
        # 1 relevant item per user -> recall@k = hit-rate, precision@k = hit-rate / k
        h_recall = hybrid_hits[k] / n
        p_recall = pop_hits[k] / n
        print(f"{'recall@'+str(k):<16}{h_recall:>12.3f}{p_recall:>14.3f}")
        print(f"{'precision@'+str(k):<16}{h_recall/k:>12.3f}{p_recall/k:>14.3f}")
    if n_err:
        print(f"\nSVD reconstruction RMSE (held-out weight): {np.sqrt(sq_err / n_err):.3f}")
    print()


if __name__ == "__main__":
    conn = data_mod.get_connection()
    try:
        evaluate(conn)
    finally:
        conn.close()
