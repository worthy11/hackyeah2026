"""Video -> landmarks -> sign segments -> gloss sequence -> Polish translation."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from pose_format import Pose

from .alignment import align_glosses
from .classifier import GlossClassifier
from .landmarks import classifier_landmarks, extract_pose
from .segmentation import SignSegmenter, refine_segments
from .gemini import GeminiTranslator

MODELS_DIR = Path(__file__).resolve().parent / "models"
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
    translation: str | None  # None without a translator or if translation failed
    signs: list[DetectedSign]
    fps: float
    n_frames: int
    debug: DebugInfo | None = None


class SignLanguagePipeline:
    """Set SIGN_CLASSIFIER_DIR to load classifier.pth + labels.json from somewhere other than `models/`."""

    def __init__(self, models_dir: Path = MODELS_DIR, device: str = "cpu", translator: GeminiTranslator | None = None):
        self.translator = translator
        self.segmenter = SignSegmenter(models_dir / "segmenter", device)
        classifier_dir = Path(os.environ.get("SIGN_CLASSIFIER_DIR", models_dir))
        self.classifier = GlossClassifier(classifier_dir / "classifier.pth", classifier_dir / "labels.json", device)

    def recognize(
        self,
        video_path: str | Path,
        debug: bool = False,
        expected_signs: int | None = None,
        expected_glosses: list[str] | None = None,
    ) -> RecognitionResult:
        """`expected_signs`: number of signs in the video, if known (see `refine_segments`).
        `expected_glosses`: the exact sentence, if known; the signs are then located by forced alignment
        (see `align_glosses`) and `confidence` is the probability the classifier gives each expected gloss."""
        return self.recognize_pose(extract_pose(video_path), debug, expected_signs, expected_glosses)

    def recognize_pose(
        self,
        pose: Pose,
        debug: bool = False,
        expected_signs: int | None = None,
        expected_glosses: list[str] | None = None,
    ) -> RecognitionResult:
        landmarks = classifier_landmarks(pose)
        fps = float(pose.body.fps)
        raw_segments = self.segmenter.segment(pose)
        segments = refine_segments(raw_segments, len(landmarks), fps, expected_signs=expected_signs or (len(expected_glosses) if expected_glosses else None))
        signs = []
        if expected_glosses and segments:
            aligned = align_glosses(self.classifier, landmarks, fps, expected_glosses, (segments[0][0], segments[-1][1]))
            signs = [DetectedSign(gloss, confidence, start, end) for gloss, (start, end, confidence) in zip(expected_glosses, aligned)]
        else:
            for start, end in segments:
                gloss, confidence = self.classifier.classify(landmarks[start:end], fps)
                if gloss != BLANK_GLOSS:
                    signs.append(DetectedSign(gloss, confidence, start, end))
        glosses = [sign.gloss for sign in signs]
        return RecognitionResult(
            glosses=glosses,
            translation=self.translator.translate(glosses) if self.translator else None,
            signs=signs,
            fps=fps,
            n_frames=len(landmarks),
            debug=DebugInfo(landmarks[..., :2].round(4).tolist(), raw_segments) if debug else None,
        )
