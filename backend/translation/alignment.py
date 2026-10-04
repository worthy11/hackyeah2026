"""Forced alignment of a known gloss sequence to a video: the best ordered, non-overlapping windows."""
from __future__ import annotations

import numpy as np

from .classifier import GlossClassifier


def align_glosses(
    classifier: GlossClassifier,
    landmarks: np.ndarray,
    fps: float,
    glosses: list[str],
    region: tuple[int, int],
    min_sign_seconds: float = 0.2,
    max_sign_seconds: float = 1.5,
) -> list[tuple[int, int, float]]:
    """Choose one window per gloss, in order and without overlap, maximizing the summed log-probability
    the classifier gives the gloss in its window. Returns (start, end, probability) per gloss.

    Candidate windows lie on the frame grid of the classifier's subsampling inside `region`."""
    step = max(1, round(fps / 15))
    points = list(range(region[0], region[1] + 1, step))
    index_of = {point: i for i, point in enumerate(points)}
    label_index = [next(i for i, label in classifier.labels.items() if label == gloss) for gloss in glosses]

    min_len, max_len = max(1, round(min_sign_seconds * fps)), round(max_sign_seconds * fps)
    windows = [
        (a, b, classifier.log_probs(landmarks[a:b], fps))
        for a in points
        for b in points
        if min_len <= b - a <= max_len
    ]
    if len(points) < 2 or not windows:
        return []

    n, k_max = len(points), len(glosses)
    best = np.full((k_max + 1, n), -np.inf)
    best[0] = 0.0
    choice: list[list[tuple[int, int] | None]] = [[None] * n for _ in range(k_max + 1)]
    by_end: dict[int, list[tuple[int, int, np.ndarray]]] = {}
    for a, b, log_probs in windows:
        by_end.setdefault(index_of[b], []).append((index_of[a], b, log_probs))

    for k in range(1, k_max + 1):
        for j in range(n):
            if j > 0 and best[k][j - 1] > best[k][j]:
                best[k][j], choice[k][j] = best[k][j - 1], None
            for a_index, _, log_probs in by_end.get(j, []):
                score = best[k - 1][a_index] + log_probs[label_index[k - 1]]
                if score > best[k][j]:
                    best[k][j], choice[k][j] = score, (a_index, j)
    if not np.isfinite(best[k_max][n - 1]):
        return []

    result, j, k = [], n - 1, k_max
    while k > 0:
        if choice[k][j] is None:
            j -= 1
            continue
        a_index, b_index = choice[k][j]
        a, b = points[a_index], points[b_index]
        log_probs = next(lp for wa, wb, lp in windows if wa == a and wb == b)
        result.append((a, b, float(np.exp(log_probs[label_index[k - 1]]))))
        j, k = a_index, k - 1
    return result[::-1]
