# AI Recommender (offline batch)

Hybrid book recommender (content-based + collaborative filtering) for the Library
Management System. It is **not** a running service — it's a Python script that
reads the same MySQL database the backend uses, computes per-user
recommendations, writes them into the `recommendations` table, and exits. The
Fastify backend only ever **reads** that table (`GET /recommendations/my`), so the
live system has no Python dependency.

## Files

| file              | role                                                            |
|-------------------|----------------------------------------------------------------|
| `recommend.py`    | entrypoint: `python recommend.py [--evaluate]`                 |
| `data.py`         | load + preprocess MySQL → interaction matrix + book features   |
| `content.py`      | content-based similarity (TF-IDF + categories + authors)       |
| `collaborative.py`| item-item CF and TruncatedSVD matrix factorization             |
| `hybrid.py`       | blend scores, fallback ladder, top-N                           |
| `writer.py`       | atomic per-user upsert into `recommendations`                 |
| `evaluate.py`     | offline precision@k / recall@k / RMSE for the report           |

## Setup & run

```bash
cd ai
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env .env            # reuse backend DB credentials (DB_* vars)

python recommend.py            # build + write the recommendations table
python recommend.py --evaluate # print offline accuracy metrics (no writes)
```

Run it manually before a demo, or schedule it nightly (cron / Task Scheduler).

## How it works

1. **Signals → interaction matrix** (`data.py`): ratings (1–5), borrows (×3),
   favorites (×4), capped views (×1) combined per (user, book) into a sparse
   user×book confidence matrix. Soft-deleted users/books excluded.
2. **Content model** (`content.py`): each book vectorized as TF-IDF(title +
   description) ⊕ category multi-hot ⊕ author multi-hot; a user is scored by
   cosine similarity between their weighted taste profile and every book.
3. **Collaborative** (`collaborative.py`): item-item cosine CF + TruncatedSVD
   latent factors.
4. **Hybrid + fallback** (`hybrid.py`): `0.6·CF + 0.4·content` (each min-max
   normalized), already-seen books removed. Fallback ladder — enough data →
   `hybrid`, little data → `content`, none → `popularity`. Each row tagged with
   its `algorithm`.
5. **Writer** (`writer.py`): replaces each user's rows atomically; idempotent.

## Tuning (`.env`)

`TOP_N` (default 20), `W_CF` (0.6), `W_CONTENT` (0.4).
