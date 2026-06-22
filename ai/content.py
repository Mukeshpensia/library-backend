"""
content.py — content-based similarity.

Vectorizes each book as TF-IDF(title + description) concatenated with multi-hot
category and author vectors. A user is scored by building a *taste profile* from
the books they positively interacted with (weighted), then cosine-comparing that
profile to every book in the catalog.

Cold start: works for a user with a single interaction, and for brand-new books
with no borrow history (they still have text/category features).
"""
import numpy as np
from scipy.sparse import csr_matrix, hstack
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import MultiLabelBinarizer
from sklearn.metrics.pairwise import cosine_similarity


class ContentModel:
    def __init__(self, books_df, category_weight=1.0, author_weight=1.0):
        self.book_ids = books_df["id"].tolist()
        self.index = {b: i for i, b in enumerate(self.book_ids)}

        text = (books_df["title"].fillna("") + " " + books_df["description"].fillna("")).tolist()
        tfidf = TfidfVectorizer(stop_words="english", max_features=5000)
        text_mat = tfidf.fit_transform(text) if any(t.strip() for t in text) else csr_matrix((len(text), 0))

        cat_mat = self._multihot(books_df["categories"]) * category_weight
        author_mat = self._multihot(books_df["authors"]) * author_weight

        self.features = hstack([text_mat, cat_mat, author_mat]).tocsr()

    @staticmethod
    def _multihot(series):
        lists = [list(x) if x else [] for x in series]
        mlb = MultiLabelBinarizer(sparse_output=True)
        mat = mlb.fit_transform(lists)
        return mat.tocsr().astype(float)

    def score_user(self, interactions):
        """interactions: iterable of (book_id, weight). Returns dict book_id -> score."""
        profile = None
        for book_id, weight in interactions:
            idx = self.index.get(book_id)
            if idx is None:
                continue
            row = self.features[idx] * float(weight)
            profile = row if profile is None else profile + row
        if profile is None:
            return {}
        scores = cosine_similarity(profile, self.features).ravel()
        return dict(zip(self.book_ids, scores))
