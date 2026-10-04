"""Video -> MediaPipe Holistic landmarks."""
from __future__ import annotations

import os
from pathlib import Path

import cv2
import numpy as np
from pose_format import Pose
from pose_format.utils.holistic import load_holistic

# The classifier's training data stores the right hand before the left one.
CLASSIFIER_COMPONENTS = ["POSE_LANDMARKS", "RIGHT_HAND_LANDMARKS", "LEFT_HAND_LANDMARKS"]
MAX_PLAUSIBLE_FPS = 120

# Speed knobs (override via env). Classifier was trained around 15 fps webcam data.
TARGET_FPS = float(os.environ.get("SIGN_EXTRACT_FPS", "15"))
MAX_SIDE = int(os.environ.get("SIGN_EXTRACT_MAX_SIDE", "480"))
MODEL_COMPLEXITY = int(os.environ.get("SIGN_HOLISTIC_COMPLEXITY", "0"))  # 0=fast, 1=default, 2=heavy

_HOLISTIC_CONFIG = {
    "model_complexity": MODEL_COMPLEXITY,
    "refine_face_landmarks": False,
    "smooth_landmarks": True,
    "min_detection_confidence": 0.5,
    "min_tracking_confidence": 0.5,
}


def warm_holistic() -> None:
    """Force MediaPipe Holistic graph into the process pool at startup."""
    blank = np.zeros((256, 256, 3), dtype=np.uint8)
    load_holistic(
        [blank, blank],
        fps=TARGET_FPS,
        width=256,
        height=256,
        additional_holistic_config=_HOLISTIC_CONFIG,
    )


def _resize(frame: np.ndarray, max_side: int) -> np.ndarray:
    h, w = frame.shape[:2]
    side = max(h, w)
    if side <= max_side:
        return frame
    scale = max_side / side
    return cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def extract_pose(video_path: str | Path) -> Pose:
    """Run MediaPipe Holistic on a downsampled frame stream.

    Bottleneck is MediaPipe (~60ms/frame at complexity 1). We cut that by:
      - model_complexity=0 (~2–3× faster)
      - resizing so the long side ≤ MAX_SIDE
      - keeping at most TARGET_FPS frames (classifier trains near 15 fps)
    """
    # NOTE: for partial/live WebM chunks ffmpeg may log "File ended prematurely".
    # This is harmless — cv2 still decodes all frames written so far.
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError("Cannot open video")
    src_fps = cap.get(cv2.CAP_PROP_FPS)
    frames_rgb: list[np.ndarray] = []
    timestamps_ms: list[float] = []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames_rgb.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        timestamps_ms.append(cap.get(cv2.CAP_PROP_POS_MSEC))
    cap.release()
    if not frames_rgb:
        raise ValueError("No frames could be read from the video")

    # Browser-recorded webm files often report a bogus fps.
    if not 0 < src_fps <= MAX_PLAUSIBLE_FPS:
        duration_ms = timestamps_ms[-1] - timestamps_ms[0]
        src_fps = (len(frames_rgb) - 1) * 1000 / duration_ms if duration_ms > 0 else 25.0

    # Keep ~TARGET_FPS — fewer Holistic calls, still enough for the LSTM.
    stride = max(1, round(src_fps / TARGET_FPS))
    kept = frames_rgb[::stride]
    out_fps = src_fps / stride

    kept = [_resize(f, MAX_SIDE) for f in kept]
    height, width = kept[0].shape[:2]

    return load_holistic(
        kept,
        fps=out_fps,
        width=width,
        height=height,
        additional_holistic_config=_HOLISTIC_CONFIG,
    )


def classifier_landmarks(pose: Pose) -> np.ndarray:
    """(T, 75, 3) pose + right hand + left hand in raw MediaPipe coordinates, zeros where undetected."""
    data = np.concatenate(
        [pose.get_components([name]).body.data.filled(0)[:, 0] for name in CLASSIFIER_COMPONENTS], axis=1
    ).astype(np.float32)
    data[..., 0] /= pose.header.dimensions.width
    data[..., 1] /= pose.header.dimensions.height
    return data
