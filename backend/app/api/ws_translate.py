"""WebSocket endpoint for sign-language translation (segmenter → classifier).

Protocol
--------
Client → server:
  - binary frames : raw video bytes (MediaRecorder chunks, or a full uploaded file)
  - text  {"done": true, "ext"?: ".webm"|".mp4"|...} : run pipeline + Gemini

Server → client:
  - {"type": "status", "stage": "extracting"|"segmenting"|"classifying"|"translating"}
  - {"type": "gloss",  "gloss": str, "confidence": float, "start_frame": int, "end_frame": int}
  - {"type": "timing", "extract_s": float, "segment_s": float, "classify_s": float, "translate_s": float}
  - {"type": "error",  "detail": str}
  - {"type": "done",   "glosses": [...], "signs": [...], "translation": str | null, "fps": float, "n_frames": int}
"""
from __future__ import annotations

import asyncio
import json
import logging
import tempfile
import threading
import time
from pathlib import Path

from fastapi import WebSocket, WebSocketDisconnect

from app.core.config import settings

from .sign_language import get_pipeline

log = logging.getLogger("uvicorn.error")

# Classifier finishes in ~ms; pace emits so the UI can show chips one-by-one.
GLOSS_EMIT_DELAY_S = 0.45


def _safe_ext(raw: str | None) -> str:
    allowed = {".webm", ".mp4", ".mov", ".mkv", ".avi"}
    ext = (raw or ".webm").lower()
    if not ext.startswith("."):
        ext = f".{ext}"
    return ext if ext in allowed else ".webm"


def _extract(video_path: Path):
    from translation.landmarks import classifier_landmarks, extract_pose

    t0 = time.perf_counter()
    pose = extract_pose(video_path)
    landmarks = classifier_landmarks(pose)
    fps = float(pose.body.fps)
    return pose, landmarks, fps, time.perf_counter() - t0


def _segment(pipeline, pose, landmarks, fps: float):
    from translation.segmentation import refine_segments

    t0 = time.perf_counter()
    raw = pipeline.segmenter.segment(pose)
    segments = refine_segments(raw, len(landmarks), fps)
    return raw, segments, time.perf_counter() - t0


def _classify_one(pipeline, landmarks, start: int, end: int, fps: float):
    t0 = time.perf_counter()
    gloss, confidence = pipeline.classifier.classify(landmarks[start:end], fps)
    return gloss, confidence, time.perf_counter() - t0


async def _stream_gemini(websocket: WebSocket, loop: asyncio.AbstractEventLoop, translator, glosses: list[str]) -> str:
    """Push Gemini token deltas over the socket as they arrive; return the full sentence."""
    queue: asyncio.Queue = asyncio.Queue()

    def worker() -> None:
        try:
            for delta in translator.translate_stream(glosses):
                loop.call_soon_threadsafe(queue.put_nowait, delta)
            loop.call_soon_threadsafe(queue.put_nowait, None)
        except Exception as exc:  # noqa: BLE001
            loop.call_soon_threadsafe(queue.put_nowait, exc)

    threading.Thread(target=worker, daemon=True).start()

    parts: list[str] = []
    while True:
        item = await queue.get()
        if item is None:
            break
        if isinstance(item, Exception):
            log.warning("Gemini stream error: %s", item)
            break
        parts.append(item)
        await websocket.send_json({"type": "translation_delta", "text": item})
        await asyncio.sleep(0)
    return "".join(parts)


async def ws_translate(websocket: WebSocket) -> None:  # noqa: C901
    await websocket.accept()

    loop = asyncio.get_event_loop()

    try:
        pipeline = await loop.run_in_executor(None, get_pipeline)
    except Exception as exc:
        await websocket.send_json({"type": "error", "detail": f"ML pipeline unavailable: {exc}"})
        await websocket.close(1011)
        return

    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = Path(tmp_dir) / "stream.webm"
        accumulated: list[bytes] = []

        while True:
            try:
                message = await websocket.receive()
            except WebSocketDisconnect:
                return

            if message["type"] == "websocket.disconnect":
                return

            if "bytes" in message and message["bytes"] is not None:
                chunk = message["bytes"]
                accumulated.append(chunk)
                total = sum(map(len, accumulated))
                # Avoid log spam on large phone uploads (37MB ≈ 140 lines otherwise).
                if len(accumulated) == 1 or len(accumulated) % 20 == 0:
                    log.info("ws chunk #%d  total=%d B", len(accumulated), total)

            elif "text" in message and message["text"] is not None:
                data = json.loads(message["text"])

                if not data.get("done"):
                    continue

                total = sum(map(len, accumulated))
                log.info("ws done  chunks=%d  bytes=%d  ext=%s", len(accumulated), total, data.get("ext"))

                if not accumulated:
                    await websocket.send_json({
                        "type": "error",
                        "detail": "Nie otrzymano danych wideo (pusty upload).",
                    })
                    return

                # Flush once at the end (not after every chunk).
                ext = _safe_ext(data.get("ext"))
                video_path = Path(tmp_dir) / f"upload{ext}"
                video_path.write_bytes(b"".join(accumulated))

                try:
                    # ── 1. Pose extraction ─────────────────────────────────
                    await websocket.send_json({"type": "status", "stage": "extracting"})
                    pose, landmarks, fps, extract_s = await loop.run_in_executor(
                        None, _extract, video_path
                    )

                    # ── 2. Segmenter ───────────────────────────────────────
                    await websocket.send_json({"type": "status", "stage": "segmenting"})
                    raw, segments, segment_s = await loop.run_in_executor(
                        None, _segment, pipeline, pose, landmarks, fps
                    )

                    # ── 3. Classify all segments, then pace gloss emits ─────
                    await websocket.send_json({"type": "status", "stage": "classifying"})
                    signs: list[dict] = []
                    classify_times: list[float] = []

                    # Known sentence configured (EXPECTED_GLOSSES): place it by forced alignment;
                    # None means it does not fit this video, so fall back to free recognition.
                    aligned = None
                    if settings.expected_gloss_list:
                        t_align = time.perf_counter()
                        aligned = await loop.run_in_executor(
                            None, pipeline.align, landmarks, fps, segments, settings.expected_gloss_list
                        )
                        classify_times.append(time.perf_counter() - t_align)
                        log.info("forced alignment %s", "used" if aligned else "rejected, falling back")
                    if aligned:
                        signs = [
                            {
                                "gloss": s.gloss,
                                "confidence": round(s.confidence, 3),
                                "start_frame": int(s.start_frame),
                                "end_frame": int(s.end_frame),
                            }
                            for s in aligned
                        ]
                    else:
                        for start, end in segments:
                            gloss, confidence, dt = await loop.run_in_executor(
                                None, _classify_one, pipeline, landmarks, start, end, fps
                            )
                            classify_times.append(dt)
                            if gloss == "blank":
                                continue
                            signs.append({
                                "gloss": gloss,
                                "confidence": round(confidence, 3),
                                "start_frame": int(start),
                                "end_frame": int(end),
                            })

                    classify_s = sum(classify_times)
                    avg_ms = (classify_s / len(classify_times) * 1000) if classify_times else 0

                    log.info(
                        "timing extract=%.2fs  segment=%.2fs (%d raw→%d refined)  "
                        "classify=%.2fs (%d segs, avg %.0fms, %d glosses)  frames=%d fps=%.1f",
                        extract_s, segment_s, len(raw), len(segments),
                        classify_s, len(segments), avg_ms, len(signs),
                        len(landmarks), fps,
                    )

                    # Stream gloss chips one-by-one (classifier itself is too fast to see).
                    for sign in signs:
                        await websocket.send_json({"type": "gloss", "gloss": sign["gloss"]})
                        await asyncio.sleep(GLOSS_EMIT_DELAY_S)

                    # ── 4. Gemini (token stream) ───────────────────────────
                    await websocket.send_json({"type": "status", "stage": "translating"})
                    all_glosses = [s["gloss"] for s in signs]
                    t3 = time.perf_counter()
                    translation = ""
                    if pipeline.translator and all_glosses:
                        translation = await _stream_gemini(
                            websocket, loop, pipeline.translator, all_glosses
                        )
                    elif not pipeline.translator:
                        log.warning("Gemini translator disabled (GEMINI_API_KEY missing/empty)")
                    translate_s = time.perf_counter() - t3

                    timings = {
                        "extract_s": round(extract_s, 3),
                        "segment_s": round(segment_s, 3),
                        "classify_s": round(classify_s, 3),
                        "translate_s": round(translate_s, 3),
                    }
                    log.info(
                        "timing translate=%.2fs  total_ml=%.2fs  translation=%s",
                        translate_s,
                        extract_s + segment_s + classify_s + translate_s,
                        "yes" if translation else "no",
                    )

                    await websocket.send_json({"type": "timing", **timings})
                    await websocket.send_json({
                        "type": "done",
                        "glosses": all_glosses,
                        "signs": signs,
                        "translation": translation or None,
                        "fps": fps,
                        "n_frames": len(landmarks),
                    })
                except Exception as exc:
                    log.exception("ws_translate failed")
                    await websocket.send_json({"type": "error", "detail": str(exc)})
                return
