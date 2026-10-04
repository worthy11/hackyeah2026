"""Frame-wise gloss streaming without the BIO segmenter.

Slides a short window over the landmark sequence, classifies each window with
the same GlossClassifier, and emits a gloss the first time the same non-blank
label wins for `streak` consecutive windows. The same gloss is not re-emitted
until a blank (or low-confidence) prediction clears the latch.
"""
from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np

from .classifier import MODEL_FPS, GlossClassifier

BLANK = "blank"

# Window length in model-rate frames (~1 s of context for the LSTM).
WINDOW_MODEL_FRAMES = 15
# How many identical consecutive predictions before we trust the gloss.
STREAK = 3
# Drop weak predictions so noise doesn't fire.
MIN_CONFIDENCE = 0.35


@dataclass
class StreamedSign:
    gloss: str
    confidence: float
    start_frame: int
    end_frame: int


def iter_stream_glosses(
    classifier: GlossClassifier,
    landmarks: np.ndarray,
    fps: float,
    *,
    window_model_frames: int = WINDOW_MODEL_FRAMES,
    streak: int = STREAK,
    min_confidence: float = MIN_CONFIDENCE,
) -> Iterator[StreamedSign]:
    """Yield each gloss once it is confirmed by `streak` consecutive windows.

    Advances one model-rate frame at a time (same step the classifier uses
    internally), so "3 frames in a row" matches the model's native rate.
    """
    if len(landmarks) == 0 or fps <= 0:
        return

    step = max(1, round(fps / MODEL_FPS))
    window = window_model_frames * step
    if len(landmarks) < window:
        return

    run_gloss: str | None = None
    run_count = 0
    run_start = 0
    run_confs: list[float] = []
    last_emitted: str | None = None

    # `end` is exclusive; hop by `step` ⇒ one model-rate frame per prediction.
    for end in range(window, len(landmarks) + 1, step):
        start = end - window
        gloss, conf = classifier.classify(landmarks[start:end], fps)

        if gloss == BLANK or conf < min_confidence:
            run_gloss = None
            run_count = 0
            run_confs = []
            if gloss == BLANK:
                last_emitted = None
            continue

        if gloss == run_gloss:
            run_count += 1
            run_confs.append(conf)
        else:
            run_gloss = gloss
            run_count = 1
            run_start = start
            run_confs = [conf]

        if run_count >= streak and gloss != last_emitted:
            yield StreamedSign(
                gloss=gloss,
                confidence=float(sum(run_confs) / len(run_confs)),
                start_frame=run_start,
                end_frame=end,
            )
            last_emitted = gloss


def stream_glosses(
    classifier: GlossClassifier,
    landmarks: np.ndarray,
    fps: float,
    **kwargs,
) -> list[StreamedSign]:
    return list(iter_stream_glosses(classifier, landmarks, fps, **kwargs))
