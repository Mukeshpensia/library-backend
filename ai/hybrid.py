"""
hybrid.py — blend content + collaborative scores, apply the fallback ladder.

Per user:
  score = w_cf * collaborative + w_content * content   (each min-max normalized)

Fallback ladder (ai-CLAUDE.md §5):
  - enough interactions          -> hybrid
  - very few interactions        -> content only
  - essentially no data / cold   -> top books by popularity_score
Each recommendation row is tagged with the algorithm that produced it.

Books the user has already interacted with are removed from their results.
"""
import numpy as np

# A user needs at least this many distinct interactions for CF to be meaningful.
MIN_CF_INTERACTIONS = 3


def _normalize(score_dict):
    """Min-max normalize a {book_id: score} dict into [0, 1]."""
    if not score_dict:
        return {}
    vals = np.array(list(score_dict.values()), dtype=float)
    lo, hi = vals.min(), vals.max()
    if hi - lo < 1e-12:
        return {k: 0.0 for k in score_dict}
    return {k: float((v - lo) / (hi - lo)) for k, v in score_dict.items()}


class HybridRecommender:
    def __init__(self, bundle, content_model, item_cf, svd_model,
                 w_cf=0.6, w_content=0.4, top_n=20):
        self.bundle = bundle
        self.content = content_model
        self.item_cf = item_cf
        self.svd = svd_model
        self.w_cf = w_cf
        self.w_content = w_content
        self.top_n = top_n

        self.book_index = bundle["book_index"]            # book_id -> col in matrix
        self.matrix = bundle["matrix"]
        self.user_index = bundle["user_index"]

        # Popularity fallback list, precomputed once.
        bdf = bundle["books_df"]
        self.popularity = list(
            bdf.sort_values("popularity_score", ascending=False)[["id", "popularity_score"]]
            .itertuples(index=False, name=None)
        )

    def _user_interactions(self, user_id):
        """List of (book_id, weight) for this user from the interaction matrix."""
        ui = self.user_index.get(user_id)
        if ui is None:
            return []
        row = self.matrix.getrow(ui).tocoo()
        inv = {v: k for k, v in self.book_index.items()}
        return [(inv[col], val) for col, val in zip(row.col, row.data)]

    def _user_vector(self, user_id):
        ui = self.user_index.get(user_id)
        if ui is None:
            return None
        return self.matrix.getrow(ui).toarray().ravel()

    def recommend_for_user(self, user_id):
        interactions = self._user_interactions(user_id)
        seen = {b for b, _ in interactions}
        n = len(interactions)

        # --- cold start: no data at all -> popularity --------------------
        if n == 0:
            ranked = [(b, s, "popularity") for b, s in self.popularity if b not in seen]
            return self._finalize(ranked)

        content_scores = _normalize(self.content.score_user(interactions))

        # --- too little data for CF -> content only ----------------------
        if n < MIN_CF_INTERACTIONS or self.item_cf is None:
            ranked = sorted(
                ((b, s, "content") for b, s in content_scores.items() if b not in seen),
                key=lambda x: x[1], reverse=True,
            )
            if not ranked:  # content produced nothing -> popularity safety net
                ranked = [(b, s, "popularity") for b, s in self.popularity if b not in seen]
            return self._finalize(ranked)

        # --- enough data -> hybrid (CF blended with content) -------------
        uvec = self._user_vector(user_id)
        cf_raw = self.item_cf.score_user(uvec)
        if self.svd is not None:
            svd_raw = self.svd.score_user(user_id)
            # average the two collaborative signals before normalizing
            cf_raw = {b: cf_raw.get(b, 0.0) + svd_raw.get(b, 0.0) for b in cf_raw}
        cf_scores = _normalize(cf_raw)

        all_books = set(cf_scores) | set(content_scores)
        blended = []
        for b in all_books:
            if b in seen:
                continue
            score = self.w_cf * cf_scores.get(b, 0.0) + self.w_content * content_scores.get(b, 0.0)
            blended.append((b, score, "hybrid"))
        blended.sort(key=lambda x: x[1], reverse=True)
        return self._finalize(blended)

    def _finalize(self, ranked):
        """Keep top-N, attach rank_position (1-based)."""
        top = ranked[: self.top_n]
        return [
            {"book_id": b, "score": float(s), "algorithm": algo, "rank_position": i + 1}
            for i, (b, s, algo) in enumerate(top)
        ]
