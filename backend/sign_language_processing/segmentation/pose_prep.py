"""Pose preprocessing matching the segmenter's training pipeline."""
from __future__ import annotations

import numpy as np
from pose_format import Pose
from pose_format.utils.generic import (
    correct_wrists,
    pose_hide_legs,
    pose_normalization_info,
    reduce_holistic,
)

HANDS = ("LEFT_HAND_LANDMARKS", "RIGHT_HAND_LANDMARKS")


def hands_visible(pose: Pose) -> np.ndarray:
    """(T,) bool: at least one hand was detected in the frame."""
    return pose.get_components(list(HANDS)).body.confidence[:, 0].max(axis=-1) > 0


def preprocess_pose(pose: Pose) -> Pose:
    pose = pose.get_components(["POSE_LANDMARKS", *HANDS])
    pose_hide_legs(pose)
    pose = reduce_holistic(pose)
    correct_wrists(pose)
    pose = pose.normalize(pose_normalization_info(pose.header))
    for hand in HANDS:
        start = pose.header._get_point_index(hand, "WRIST")
        points = pose.body.data[:, :, start : start + 21]
        pose.body.data[:, :, start : start + 21] = points - points[:, :, :1]
    return pose


def compute_velocity(pose_data: np.ndarray, frame_times: np.ndarray) -> np.ndarray:
    if len(pose_data) <= 1:
        return np.zeros_like(pose_data)
    vel = np.diff(pose_data, axis=0) / np.diff(frame_times)[:, None, None]
    return np.concatenate([np.zeros_like(pose_data[:1]), vel], axis=0)


def pose_to_model_input(pose: Pose, mean: np.ndarray, std: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (T, joints, 6) float32 position+velocity features and (T,) timestamps in seconds."""
    processed = preprocess_pose(pose)
    processed.body.data = (processed.body.data - mean) / std
    pose_data = processed.body.data.filled(0)[:, 0, :, :3].astype(np.float32)
    frame_times = np.arange(len(pose_data), dtype=np.float32) / float(pose.body.fps)
    vel = compute_velocity(pose_data, frame_times)
    return np.concatenate([pose_data, vel], axis=-1), frame_times
