"""Precompute avatar-driving landmarks from public signing clips.

Writes media/sign_landmarks/{id}.json when missing. Safe to call every boot.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

log = logging.getLogger("uvicorn.error")

# backend/translation/this_file.py → repo root
_REPO = Path(__file__).resolve().parents[2]
_PUBLIC = _REPO / "frontend" / "public"

CLIP_IDS = ("1", "2")

# Match classifier extract rate so files stay small enough for the browser.
TARGET_FPS = 15.0
MAX_SIDE = 480


def resolve_clip_video(clip_id: str, media_dir: str | Path) -> Path | None:
    """Prefer uploaded sample, then public/avatar-sample-{id}.webm, then public/{id}.mp4."""
    source_dir = Path(media_dir) / "sign_source"
    if source_dir.is_dir():
        matches = sorted(source_dir.glob(f"{clip_id}.*"))
        if matches:
            return matches[0]
    for name in (f"avatar-sample-{clip_id}.webm", f"avatar-sample-{clip_id}.mp4", f"{clip_id}.mp4"):
        candidate = _PUBLIC / name
        if candidate.is_file():
            return candidate
    return None


def write_landmarks(media_dir: str | Path, clip_id: str, data: dict) -> Path:
    out_dir = Path(media_dir) / "sign_landmarks"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{clip_id}.json"
    out_path.write_text(json.dumps(data, separators=(",", ":")), encoding="utf-8")
    return out_path


def _resize(frame: np.ndarray, max_side: int) -> np.ndarray:
    h, w = frame.shape[:2]
    side = max(h, w)
    if side <= max_side:
        return frame
    scale = max_side / side
    return cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)


def _xyz(landmarks) -> list[list[float]] | None:
    if landmarks is None:
        return None
    return [[lm.x, lm.y, lm.z] for lm in landmarks.landmark]


def _xyzw(landmarks) -> list[list[float]] | None:
    if landmarks is None:
        return None
    return [[lm.x, lm.y, lm.z, float(getattr(lm, "visibility", 1.0))] for lm in landmarks.landmark]


def _hand_as_world(hand, pose_img, pose_world, wrist_idx: int) -> list[list[float]] | None:
    """Holistic hands are image-space — lift them into pose-world via the wrist."""
    if hand is None or pose_img is None or pose_world is None:
        return None
    wi = pose_img.landmark[wrist_idx]
    ww = pose_world.landmark[wrist_idx]
    out: list[list[float]] = []
    for lm in hand.landmark:
        dx = lm.x - wi.x
        dy = lm.y - wi.y
        dz = lm.z - wi.z
        # Image Y is down; world Y is up.
        out.append([ww.x + dx, ww.y - dy, ww.z + dz])
    return out


def extract_clip(video_path: Path) -> dict:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise ValueError(f"Cannot open {video_path}")

    src_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    if not 0 < src_fps <= 120:
        src_fps = 25.0
    stride = max(1, round(src_fps / TARGET_FPS))
    out_fps = src_fps / stride

    frames: list[dict] = []
    idx = 0
    with mp.solutions.holistic.Holistic(
        static_image_mode=False,
        model_complexity=1,
        refine_face_landmarks=False,
        smooth_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as holistic:
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            if idx % stride != 0:
                idx += 1
                continue
            idx += 1
            rgb = cv2.cvtColor(_resize(bgr, MAX_SIDE), cv2.COLOR_BGR2RGB)
            result = holistic.process(rgb)
            if result.pose_world_landmarks is None or result.pose_landmarks is None:
                continue
            frames.append(
                {
                    "poseWorld": _xyz(result.pose_world_landmarks),
                    "poseImage": _xyzw(result.pose_landmarks),
                    "leftHandWorld": _hand_as_world(
                        result.left_hand_landmarks,
                        result.pose_landmarks,
                        result.pose_world_landmarks,
                        15,
                    ),
                    "rightHandWorld": _hand_as_world(
                        result.right_hand_landmarks,
                        result.pose_landmarks,
                        result.pose_world_landmarks,
                        16,
                    ),
                }
            )
    cap.release()

    if not frames:
        raise ValueError(f"No pose frames in {video_path}")

    return {"fps": round(out_fps, 4), "frames": frames}


def ensure_avatar_landmarks(media_dir: str | Path) -> None:
    out_dir = Path(media_dir) / "sign_landmarks"
    out_dir.mkdir(parents=True, exist_ok=True)

    for clip_id in CLIP_IDS:
        out_path = out_dir / f"{clip_id}.json"
        video_path = resolve_clip_video(clip_id, media_dir)
        if video_path is None:
            if out_path.exists():
                log.info("Avatar landmarks present  %s (no source video)", out_path.name)
            else:
                log.warning("Avatar clip missing, skip precompute  id=%s", clip_id)
            continue
        if out_path.exists() and out_path.stat().st_mtime >= video_path.stat().st_mtime:
            log.info("Avatar landmarks up to date  %s ← %s", out_path.name, video_path.name)
            continue
        log.info("Precomputing avatar landmarks from %s …", video_path.name)
        data = extract_clip(video_path)
        write_landmarks(media_dir, clip_id, data)
        log.info(
            "Wrote %s  frames=%d  fps=%s  source=%s",
            out_path.name,
            len(data["frames"]),
            data["fps"],
            video_path.name,
        )
