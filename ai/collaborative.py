"""
collaborative.py — collaborative filtering over the user x book interaction matrix.

Two approaches (both implemented, per ai-CLAUDE.md §5 / the report):
  - ItemCF: item-item cosine similarity; recommend books similar to what the
    user already engaged with.
  - SVDModel: TruncatedSVD matrix factorization; latent user/item factors whose
    dot product predicts a score for unseen books (also used for RMSE in eval).
"""
import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.metrics.pairwise import cosine_similarity


class ItemCF:
    def __init__(self, matrix, book_ids):
        # matrix: users x books (CSR). Column similarity => book x book.
        self.book_ids = book_ids
        self.index = {b: i for i, b in enumerate(book_ids)}
        self.sim = cosine_similarity(matrix.T, dense_output=True)

    def score_user(self, user_vector):
        """user_vector: 1-D array over books (their weights). Returns dict book_id -> score."""
        raw = self.sim.dot(user_vector)
        return dict(zip(self.book_ids, raw))


class SVDModel:
    def __init__(self, matrix, users, book_ids, n_components=20, random_state=42):
        self.users = users
        self.user_index = {u: i for i, u in enumerate(users)}
        self.book_ids = book_ids

        # n_components must be < min(matrix dims); keep at least 1.
        k = min(n_components, min(matrix.shape) - 1)
        k = max(k, 1)
        self.svd = TruncatedSVD(n_components=k, random_state=random_state)
        self.user_factors = self.svd.fit_transform(matrix)   # users x k
        self.item_factors = self.svd.components_.T            # books x k

    def predict_vector(self, user_id):
        """Reconstructed predicted scores over all books for a user (1-D array)."""
        i = self.user_index.get(user_id)
        if i is None:
            return np.zeros(len(self.book_ids))
        return self.user_factors[i].dot(self.item_factors.T)

    def score_user(self, user_id):
        return dict(zip(self.book_ids, self.predict_vector(user_id)))
