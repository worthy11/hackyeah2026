"""Pose sequence -> sign segments, using the BIO frame tagger."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
from pose_format import Pose
from safetensors.torch import load_file

from .model import BIO, PoseSignModel
from .pose_prep import hands_visible, pose_to_model_input


class SignSegmenter:
    def __init__(self, weights_dir: Path, device: str = "cpu"):
        self.device = device
        config = json.loads((weights_dir / "config.json").read_text())
        self.model = PoseSignModel(**config)
        self.model.load_state_dict(load_file(weights_dir / "model.safetensors", device=device))
        self.model.to(device).eval()
        self.mean = np.load(weights_dir / "norm_mean.npy")
        self.std = np.load(weights_dir / "norm_std.npy")

    @torch.inference_mode()
    def segment(self, pose: Pose) -> list[tuple[int, int]]:
        """Return raw [start, end) frame spans of detected signing; see `refine_segments`.

        Frames without any detected hand are always treated as non-sign.
        """
        pose_data, frame_times = pose_to_model_input(pose, self.mean, self.std)
        log_probs = self.model(
            torch.from_numpy(pose_data)[None].to(self.device),
            timestamps=torch.from_numpy(frame_times)[None].to(self.device),
        )["sign"][0]
        labels = log_probs.argmax(dim=-1).cpu().numpy()
        labels[~hands_visible(pose)] = BIO["O"]
        return bio_to_segments(labels.tolist())


def bio_to_segments(labels: list[int]) -> list[tuple[int, int]]:
    """Per-frame BIO tags -> [start, end) spans; every B tag starts a new sign."""
    segments: list[tuple[int, int]] = []
    start = None
    for i, label in enumerate(labels):
        if label == BIO["I"] and start is not None:
            continue
        if start is not None:
            segments.append((start, i))
            start = None
        if label in (BIO["B"], BIO["I"]):
            start = i
    if start is not None:
        segments.append((start, len(labels)))
    return segments


def refine_segments(
    segments: list[tuple[int, int]],
    n_frames: int,
    fps: float,
    min_sign_seconds: float = 0.2,
    merge_gap_seconds: float = 0.1,
    max_padding_seconds: float | None = 0.5,
    expected_signs: int | None = None,
) -> list[tuple[int, int]]:
    """Merge signs split by short pauses, drop blips, then extend each sign towards the midpoints
    of the surrounding pauses (by at most `max_padding_seconds`; None uses every frame).

    With `expected_signs` (known sentence length), the shortest sign is merged into its nearest
    neighbour until at most that many remain; fewer detected signs are left as they are."""
    merged: list[tuple[int, int]] = []
    for start, end in segments:
        if merged and (start - merged[-1][1]) / fps < merge_gap_seconds:
            merged[-1] = (merged[-1][0], end)
        else:
            merged.append((start, end))
    signs = [(start, end) for start, end in merged if (end - start) / fps >= min_sign_seconds]
    while expected_signs is not None and len(signs) > expected_signs:
        shortest = min(range(len(signs)), key=lambda k: signs[k][1] - signs[k][0])
        gap_before = signs[shortest][0] - signs[shortest - 1][1] if shortest > 0 else float("inf")
        gap_after = signs[shortest + 1][0] - signs[shortest][1] if shortest < len(signs) - 1 else float("inf")
        i = shortest - 1 if gap_before <= gap_after else shortest
        signs[i : i + 2] = [(signs[i][0], signs[i + 1][1])]

    pad = n_frames if max_padding_seconds is None else round(max_padding_seconds * fps)
    bounds = [0] + [(end + start) // 2 for (_, end), (start, _) in zip(signs, signs[1:])] + [n_frames]
    return [
        (max(low, start - pad), min(high, end + pad))
        for (start, end), low, high in zip(signs, bounds, bounds[1:])
    ]
