"""Record labelled sign samples from the webcam in a local OpenCV window.

    python -m sign_data_collection.collect

Two modes (M toggles):
  isolated   - one sign per video, saved as samples/<sign>/<timestamp>.mp4 (used for training);
               moving a file to another folder relabels it.
  continuous - several signs per video, saved as continuous/<timestamp>.mp4 + .json with the
               sign sequence (for evaluating inference only).

Keys: A/D or arrows - previous/next sign, ENTER / BACKSPACE - add / remove a sign of the
continuous sequence, SPACE - start (after a countdown) / stop recording, X - delete the last
recording, ESC/Q - quit.
"""
import json
import time
from datetime import datetime
from pathlib import Path

import cv2

from .config import CONTINUOUS_DIR, GLOSSES, SAMPLES_DIR, ascii_name

COUNTDOWN_SECONDS = 2
MAX_RECORDING_SECONDS = {"isolated": 5, "continuous": 30}
KEYS_PREVIOUS = {ord("a"), 2424832}
KEYS_NEXT = {ord("d"), 2555904}
KEYS_QUIT = {27, ord("q")}
KEY_ENTER, KEY_BACKSPACE, KEY_SPACE = 13, 8, ord(" ")


def sample_dir(gloss: str) -> Path:
    return SAMPLES_DIR / ascii_name(gloss)


def new_path(directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    return directory / f"{datetime.now():%Y%m%d_%H%M%S}.mp4"


def save_video(path: Path, frames: list, fps: float) -> None:
    """H.264 through Windows Media Foundation so browsers can play it; mp4v if that encoder is unavailable."""
    size = frames[0].shape[1::-1]
    writer = cv2.VideoWriter(str(path), cv2.CAP_MSMF, cv2.VideoWriter_fourcc(*"avc1"), fps, size)
    if not writer.isOpened():
        writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    for frame in frames:
        writer.write(frame)
    writer.release()


def save_recording(mode: str, frames: list, fps: float, gloss: str, sequence: list[str]) -> list[Path]:
    """Save a recording and return the files written."""
    if mode == "isolated":
        path = new_path(sample_dir(gloss))
        save_video(path, frames, fps)
        return [path]
    path = new_path(CONTINUOUS_DIR)
    save_video(path, frames, fps)
    annotation = path.with_suffix(".json")
    annotation.write_text(json.dumps({"glosses": sequence}, ensure_ascii=False), encoding="utf-8")
    return [path, annotation]


def draw_lines(image, lines: list[str], color: tuple[int, int, int]) -> None:
    for i, line in enumerate(lines):
        cv2.putText(image, line, (10, 30 + 30 * i), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2, cv2.LINE_AA)


def idle_lines(mode: str, gloss: str, sequence: list[str]) -> list[str]:
    if mode == "isolated":
        count = len(list(sample_dir(gloss).glob("*.mp4")))
        return [
            f"ISOLATED  {ascii_name(gloss)}  ({count} samples)",
            "A/D: change sign  SPACE: record  X: delete last",
            "M: continuous mode  ESC: quit",
        ]
    return [
        f"CONTINUOUS  sign: {ascii_name(gloss)}",
        "sequence: " + (" ".join(ascii_name(g) for g in sequence) or "(empty)"),
        "A/D: change sign  ENTER: add  BACKSPACE: remove",
        "SPACE: record  X: delete last  M: isolated mode  ESC: quit",
    ]


def main() -> None:
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    mode, gloss_index, sequence = "isolated", 0, []
    countdown_end, frames, started, last_files = None, None, 0.0, []

    while True:
        ok, frame = cap.read()
        if not ok:
            raise RuntimeError("Cannot read from the webcam")
        now = time.time()
        gloss = GLOSSES[gloss_index]
        if countdown_end is not None and now >= countdown_end:
            countdown_end, frames, started = None, [], now
        if frames is not None:
            frames.append(frame)

        preview = cv2.flip(frame, 1)
        if frames is not None:
            label = ascii_name(gloss) if mode == "isolated" else " ".join(ascii_name(g) for g in sequence)
            draw_lines(preview, [f"REC {now - started:.1f}s  {label}", "SPACE: stop"], (0, 0, 255))
        elif countdown_end is not None:
            draw_lines(preview, [f"Recording in {countdown_end - now:.1f}s"], (0, 165, 255))
        else:
            draw_lines(preview, idle_lines(mode, gloss, sequence), (0, 200, 0))
        cv2.imshow("Sign sample collection", preview)
        key = cv2.waitKeyEx(1)

        if frames is not None:
            if key == KEY_SPACE or now - started >= MAX_RECORDING_SECONDS[mode]:
                if len(frames) > 1:
                    last_files = save_recording(mode, frames, (len(frames) - 1) / (now - started), gloss, sequence)
                    print("saved", *last_files)
                frames = None
        elif countdown_end is None:
            if key == KEY_SPACE:
                if mode == "continuous" and not sequence:
                    print("Add at least one sign to the sequence (ENTER) before recording.")
                else:
                    countdown_end = now + COUNTDOWN_SECONDS
            elif key in KEYS_PREVIOUS:
                gloss_index = (gloss_index - 1) % len(GLOSSES)
            elif key in KEYS_NEXT:
                gloss_index = (gloss_index + 1) % len(GLOSSES)
            elif key == ord("m"):
                mode = "continuous" if mode == "isolated" else "isolated"
            elif key == KEY_ENTER and mode == "continuous":
                sequence.append(gloss)
            elif key == KEY_BACKSPACE and mode == "continuous" and sequence:
                sequence.pop()
            elif key == ord("x") and last_files:
                for path in last_files:
                    path.unlink(missing_ok=True)
                print("deleted", *last_files)
                last_files = []
            elif key in KEYS_QUIT:
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
