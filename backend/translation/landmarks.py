"""Video -> MediaPipe Holistic landmarks."""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
from pose_format import Pose
from pose_format.utils.holistic import load_holistic

# The classifier's training data stores the right hand before the left one.
CLASSIFIER_COMPONENTS = ["POSE_LANDMARKS", "RIGHT_HAND_LANDMARKS", "LEFT_HAND_LANDMARKS"]
MAX_PLAUSIBLE_FPS = 120


def extract_pose(video_path: str | Path) -> Pose:
    """Run MediaPipe Holistic on every frame. Raises ValueError for unreadable videos."""
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError("Cannot open video")
    fps = cap.get(cv2.CAP_PROP_FPS)
    frames, timestamps_ms = [], []
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frames.append(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        timestamps_ms.append(cap.get(cv2.CAP_PROP_POS_MSEC))
    cap.release()
    if not frames:
        raise ValueError("No frames could be read from the video")

    # Browser-recorded webm files often report a bogus fps.
    if not 0 < fps <= MAX_PLAUSIBLE_FPS:
        duration_ms = timestamps_ms[-1] - timestamps_ms[0]
        fps = (len(frames) - 1) * 1000 / duration_ms if duration_ms > 0 else 25.0

    height, width = frames[0].shape[:2]
    return load_holistic(
        frames,
        fps=fps,
        width=width,
        height=height,
        additional_holistic_config={"model_complexity": 1},
    )


def classifier_landmarks(pose: Pose) -> np.ndarray:
    """(T, 75, 3) pose + right hand + left hand in raw MediaPipe coordinates, zeros where undetected."""
    data = np.concatenate(
        [pose.get_components([name]).body.data.filled(0)[:, 0] for name in CLASSIFIER_COMPONENTS], axis=1
    ).astype(np.float32)
    data[..., 0] /= pose.header.dimensions.width
    data[..., 1] /= pose.header.dimensions.height
    return data
