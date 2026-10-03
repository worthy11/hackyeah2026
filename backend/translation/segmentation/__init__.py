"""Splits a pose sequence into individual sign segments."""

from .segmenter import SignSegmenter, refine_segments

__all__ = ["SignSegmenter", "refine_segments"]
