"""
writer.py — upsert ranked results into the `recommendations` table.

For each user we replace their previous recommendations atomically (delete then
insert inside one transaction). Re-running fully refreshes the table, so the job
is idempotent. The backend's /recommendations/my reads exactly these rows.
"""
import uuid


def write_recommendations(conn, user_recs):
    """user_recs: dict[user_id] -> list of {book_id, score, algorithm, rank_position}."""
    cur = conn.cursor()
    total = 0
    try:
        for user_id, recs in user_recs.items():
            cur.execute("DELETE FROM recommendations WHERE user_id = %s", (user_id,))
            if not recs:
                continue
            rows = [
                (str(uuid.uuid4()), user_id, r["book_id"], float(r["score"]),
                 r["algorithm"], int(r["rank_position"]))
                for r in recs
            ]
            cur.executemany(
                """INSERT INTO recommendations
                       (id, user_id, book_id, score, algorithm, rank_position)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                rows,
            )
            total += len(rows)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
    return total
