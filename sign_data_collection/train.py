"""Train the gloss classifier from scratch on the collected isolated samples.

    python -m sign_data_collection.train [--samples DIR] [--epochs 120] [--hidden 64]

Every video in samples/<sign>/ is one sign; only signs with at least MIN_SAMPLES videos are used.
Landmarks are extracted and cropped like in the backend pipeline and cached next to each video
(.npz; delete them after changing the pipeline). Every TEST_EVERY-th sample of each sign is held
out for the final accuracy report. The model is saved to models/<timestamp>/ - copy its files into
backend/sign_language_processing/data/ or point the backend at it with SIGN_CLASSIFIER_DIR.
"""
import argparse
import json
import random
from datetime import datetime
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

from .config import GLOSSES, MODELS_DIR, SAMPLES_DIR, ascii_name
from sign_language_processing.classifier import MODEL_FPS, LSTMClassifier, preprocess
from sign_language_processing.landmarks import classifier_landmarks, extract_pose
from sign_language_processing.pipeline import DATA_DIR
from sign_language_processing.segmentation import SignSegmenter, refine_segments

VIDEO_SUFFIXES = {".mp4", ".webm", ".mov", ".avi"}
MIN_SAMPLES = 10
TEST_EVERY = 5
STOP_NOISE_CUTOFF = 0.2  # the end of each recording is the signer reaching for the keyboard
BATCH_SIZE = 8
HANDS = (slice(33, 54), slice(54, 75))

Sample = tuple[int, np.ndarray, float]


def load_sample(video: Path, segmenter: SignSegmenter) -> tuple[np.ndarray, float]:
    cache = video.with_suffix(".npz")
    if not cache.exists():
        pose = extract_pose(video)
        n_frames = len(pose.body.data) - int(STOP_NOISE_CUTOFF * len(pose.body.data))
        pose.body = pose.body[:n_frames]
        landmarks = classifier_landmarks(pose)
        fps = float(pose.body.fps)
        segments = refine_segments(segmenter.segment(pose), len(landmarks), fps)
        if segments:
            landmarks = landmarks[segments[0][0] : segments[-1][1]]
        np.savez(cache, landmarks=landmarks, fps=fps)
    data = np.load(cache)
    return data["landmarks"], float(data["fps"])


def load_samples(samples_dir: Path) -> tuple[list[str], list[Sample]]:
    segmenter = SignSegmenter(DATA_DIR / "segmenter")
    glosses, samples = [], []
    for gloss in GLOSSES:
        videos = sorted(p for p in (samples_dir / ascii_name(gloss)).glob("*") if p.suffix.lower() in VIDEO_SUFFIXES)
        if len(videos) < MIN_SAMPLES:
            print(f"  {gloss:16s} {len(videos):3d} samples - skipped")
            continue
        print(f"  {gloss:16s} {len(videos):3d} samples")
        samples += [(len(glosses), *load_sample(video, segmenter)) for video in videos]
        glosses.append(gloss)
    return glosses, samples


def split(samples: list[Sample]) -> tuple[list[Sample], list[Sample]]:
    train, test = [], []
    for label in sorted({s[0] for s in samples}):
        group = [s for s in samples if s[0] == label]
        random.shuffle(group)
        n_test = len(group) // TEST_EVERY
        test += group[:n_test]
        train += group[n_test:]
    return train, test


def inference_frames(landmarks: np.ndarray, fps: float) -> np.ndarray:
    """Same subsampling as `GlossClassifier.classify`."""
    return landmarks[:: max(1, round(fps / MODEL_FPS))]


def augmented_frames(landmarks: np.ndarray, fps: float, rng: np.random.Generator) -> np.ndarray:
    """Random rotation/scale/shift, jitter, lost hand detections, speed change, frame drops and end trims."""
    present = np.abs(landmarks).sum(-1, keepdims=True) > 0
    angle, scale = rng.uniform(-0.15, 0.15), rng.uniform(0.85, 1.15)
    rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    x = landmarks.copy()
    x[..., :2] = (x[..., :2] - 0.5) @ rotation.T * scale + 0.5 + rng.uniform(-0.05, 0.05, 2)
    x = np.where(present, x + rng.normal(0, 0.003, x.shape), 0).astype(np.float32)
    for hand in HANDS:
        x[rng.random(len(x)) < 0.1, hand] = 0

    step = max(1.0, fps / MODEL_FPS) * rng.uniform(0.8, 1.25)
    x = x[np.arange(rng.uniform(0, step), len(x), step).astype(int)]
    kept = x[rng.random(len(x)) > 0.15]
    trim = len(kept) // 10
    kept = kept[rng.integers(trim + 1) : len(kept) - rng.integers(trim + 1)]
    return kept if len(kept) >= 4 else inference_frames(landmarks, fps)


def logits(model: LSTMClassifier, frames: list[np.ndarray]) -> torch.Tensor:
    return torch.cat([model(preprocess(torch.from_numpy(np.ascontiguousarray(x)))[None]) for x in frames])


@torch.no_grad()
def predict(model: LSTMClassifier, samples: list[Sample]) -> np.ndarray:
    model.eval()
    return logits(model, [inference_frames(lm, fps) for _, lm, fps in samples]).argmax(dim=1).numpy()


def print_report(glosses: list[str], labels: np.ndarray, predictions: np.ndarray) -> None:
    names = [ascii_name(g)[:8] for g in glosses]
    matrix = np.zeros((len(glosses), len(glosses)), dtype=int)
    for true, predicted in zip(labels, predictions):
        matrix[true, predicted] += 1
    print("confusion matrix (rows: true, columns: predicted)")
    print(" " * 17 + " ".join(f"{n:>8s}" for n in names))
    for gloss, row in zip(glosses, matrix):
        accuracy = row[glosses.index(gloss)] / max(row.sum(), 1)
        print(f"{ascii_name(gloss):16s} " + " ".join(f"{v:8d}" for v in row) + f"   {accuracy:.0%}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=Path, default=SAMPLES_DIR)
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--hidden", type=int, default=64)
    parser.add_argument("--lr", type=float, default=2e-3)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()
    random.seed(args.seed)
    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)

    print(f"Loading samples from {args.samples}")
    glosses, samples = load_samples(args.samples)
    if not samples:
        raise SystemExit("No signs with enough samples.")
    train, test = split(samples)
    print(f"{len(glosses)} signs, {len(train)} training / {len(test)} test samples")

    model = LSTMClassifier(225, args.hidden, 1, len(glosses))
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-2)
    steps_per_epoch = -(-len(train) // BATCH_SIZE)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(optimizer, args.lr, total_steps=args.epochs * steps_per_epoch)
    for epoch in range(1, args.epochs + 1):
        model.train()
        random.shuffle(train)
        losses = []
        for i in range(0, len(train), BATCH_SIZE):
            batch = train[i : i + BATCH_SIZE]
            output = logits(model, [augmented_frames(lm, fps, rng) for _, lm, fps in batch])
            loss = F.cross_entropy(output, torch.tensor([s[0] for s in batch]), label_smoothing=0.1)
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            losses.append(loss.item())
        if epoch % 20 == 0 or epoch == args.epochs:
            train_acc = (predict(model, train) == [s[0] for s in train]).mean()
            print(f"epoch {epoch:4d}  loss {np.mean(losses):.3f}  train acc {train_acc:.2f}")

    test_labels = np.array([s[0] for s in test])
    test_predictions = predict(model, test)
    print(f"\ntest accuracy {(test_predictions == test_labels).mean():.2f} ({len(test)} samples)")
    print_report(glosses, test_labels, test_predictions)

    out = MODELS_DIR / f"{datetime.now():%Y%m%d_%H%M%S}"
    out.mkdir(parents=True)
    torch.save(model.state_dict(), out / "classifier.pth")
    labels = {gloss: index for index, gloss in enumerate(glosses)}
    (out / "labels.json").write_text(json.dumps(labels, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved {out}\nUse it in the backend: set SIGN_CLASSIFIER_DIR={out}")


if __name__ == "__main__":
    main()
