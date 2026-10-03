"""Video -> landmarks -> sign segments -> gloss sequence."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from pose_format import Pose

from .classifier import GlossClassifier
from .landmarks import classifier_landmarks, extract_pose
from .segmentation import SignSegmenter, refine_segments

DATA_DIR = Path(__file__).resolve().parent / "data"
BLANK_GLOSS = "blank"


@dataclass
class DetectedSign:
    gloss: str
    confidence: float
    start_frame: int
    end_frame: int


@dataclass
class DebugInfo:
    landmarks: list[list[list[float]]]  # (T, 75, 2) normalized x, y of pose + hands; 0 if undetected
    raw_segments: list[tuple[int, int]]  # segmenter output before refinement


@dataclass
class RecognitionResult:
    glosses: list[str]
    signs: list[DetectedSign]
    fps: float
    n_frames: int
    debug: DebugInfo | None = None


class SignLanguagePipeline:
    """Set SIGN_CLASSIFIER_DIR to load classifier.pth + labels.json from somewhere other than `data/`."""

    def __init__(self, data_dir: Path = DATA_DIR, device: str = "cpu"):
        self.segmenter = SignSegmenter(data_dir / "segmenter", device)
        classifier_dir = Path(os.environ.get("SIGN_CLASSIFIER_DIR", data_dir))
        self.classifier = GlossClassifier(classifier_dir / "classifier.pth", classifier_dir / "labels.json", device)

    def recognize(self, video_path: str | Path, debug: bool = False) -> RecognitionResult:
        return self.recognize_pose(extract_pose(video_path), debug)

    def recognize_pose(self, pose: Pose, debug: bool = False) -> RecognitionResult:
        landmarks = classifier_landmarks(pose)
        fps = float(pose.body.fps)
        raw_segments = self.segmenter.segment(pose)
        segments = refine_segments(raw_segments, len(landmarks), fps)
        signs = []
        for start, end in segments:
            gloss, confidence = self.classifier.classify(landmarks[start:end], fps)
            if gloss != BLANK_GLOSS:
                signs.append(DetectedSign(gloss, confidence, start, end))
        return RecognitionResult(
            glosses=[sign.gloss for sign in signs],
            signs=signs,
            fps=fps,
            n_frames=len(landmarks),
            debug=DebugInfo(landmarks[..., :2].round(4).tolist(), raw_segments) if debug else None,
        )


@lru_cache(maxsize=1)
def get_pipeline() -> SignLanguagePipeline:
    return SignLanguagePipeline()
