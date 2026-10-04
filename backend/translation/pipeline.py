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
ALIGN_MIN_MEAN_CONFIDENCE = 0.45
# Tuned on a handful of clips: the right sentence never had a gloss below 0.2, other sentences had letters near 0.1.
ALIGN_MIN_GLOSS_CONFIDENCE = 0.15
ALIGN_MARGIN_SECONDS = 0.5


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
        # Override via .env: SIGN_CLASSIFIER_WEIGHTS / SIGN_CLASSIFIER_LABELS
        weights = Path(os.environ.get("SIGN_CLASSIFIER_WEIGHTS", classifier_dir / "classifier.pth"))
        labels = Path(os.environ.get("SIGN_CLASSIFIER_LABELS", classifier_dir / "labels.json"))
        self.classifier = GlossClassifier(weights, labels, device)
        self.classifier_weights = weights
        self.classifier_labels = labels

    def align(
        self,
        landmarks,
        fps: float,
        segments: list[tuple[int, int]],
        glosses: list[str],
        min_mean_confidence: float = ALIGN_MIN_MEAN_CONFIDENCE,
        min_gloss_confidence: float = ALIGN_MIN_GLOSS_CONFIDENCE,
    ) -> list[DetectedSign] | None:
        """Place the known sentence `glosses` in the video (see `align_glosses`), searching the detected
        signing plus a margin. None if there is no signing or the sentence does not fit well (the mean
        probability of the glosses is below `min_mean_confidence`, or any single gloss below
        `min_gloss_confidence`), i.e. the video says something else."""
        if not segments:
            return None
        margin = round(ALIGN_MARGIN_SECONDS * fps)
        region = (max(0, segments[0][0] - margin), min(len(landmarks), segments[-1][1] + margin))
        aligned = align_glosses(self.classifier, landmarks, fps, glosses, region)
        if len(aligned) != len(glosses):
            return None
        confidences = [c for *_, c in aligned]
        if sum(confidences) / len(confidences) < min_mean_confidence or min(confidences) < min_gloss_confidence:
            return None
        return [DetectedSign(gloss, confidence, start, end) for gloss, (start, end, confidence) in zip(glosses, aligned)]

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
        signs = self.align(landmarks, fps, segments, expected_glosses) if expected_glosses else None
        if signs is None:
            signs = []
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
