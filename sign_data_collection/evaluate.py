"""Run the backend pipeline on the annotated continuous recordings and compare the gloss sequences.

    python -m sign_data_collection.evaluate [--model DIR]   (default: newest models/ entry)
"""
import argparse
import json
import os
from pathlib import Path

from .config import CONTINUOUS_DIR, MODELS_DIR, ascii_name
from sign_language_processing.landmarks import extract_pose
from sign_language_processing.pipeline import SignLanguagePipeline

STOP_NOISE_SECONDS = 0.7  # the end of each recording is the signer reaching for the keyboard


def edit_distance(a: list[str], b: list[str]) -> int:
    row = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        previous, row[0] = row[0], i
        for j, y in enumerate(b, 1):
            previous, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, previous + (x != y))
    return row[-1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, default=None)
    args = parser.parse_args()
    model_dir = args.model or max(MODELS_DIR.iterdir())
    os.environ["SIGN_CLASSIFIER_DIR"] = str(model_dir)
    pipeline = SignLanguagePipeline()
    print(f"model: {model_dir}")

    errors = total = exact = 0
    annotations = sorted(CONTINUOUS_DIR.glob("*.json"))
    for annotation in annotations:
        expected = [ascii_name(g) for g in json.loads(annotation.read_text(encoding="utf-8"))["glosses"]]
        pose = extract_pose(annotation.with_suffix(".mp4"))
        pose.body = pose.body[: max(1, len(pose.body.data) - round(STOP_NOISE_SECONDS * pose.body.fps))]
        result = pipeline.recognize_pose(pose)
        predicted = [ascii_name(sign.gloss) for sign in result.signs]
        distance = edit_distance(expected, predicted)
        errors, total, exact = errors + distance, total + len(expected), exact + (distance == 0)
        details = ", ".join(
            f"{ascii_name(s.gloss)} {s.confidence:.2f} [{s.start_frame / result.fps:.1f}-{s.end_frame / result.fps:.1f}s]"
            for s in result.signs
        )
        print(f"{'OK ' if distance == 0 else 'ERR'} {annotation.stem}  expected {' '.join(expected)}  ->  {details}")
    print(f"\nexact sequences {exact}/{len(annotations)}, sign error rate {errors / max(total, 1):.0%}")


if __name__ == "__main__":
    main()
