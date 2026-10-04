"""Upload a signing sample and save avatar landmark JSON.

Prefer client-captured keypoints (same MediaPipe trackers as the live mirror).
Fall back to server Holistic extraction from the video when landmarks are omitted.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.core.config import settings
from translation.precompute_avatar_landmarks import extract_clip, write_landmarks

log = logging.getLogger("uvicorn.error")
router = APIRouter(tags=["avatar-sample"])

ALLOWED = {"1", "2"}


@router.post("/avatar-sample/{clip_id}")
async def upload_avatar_sample(
    clip_id: str,
    video: UploadFile = File(...),
    landmarks: UploadFile | None = File(None),
) -> dict:
    if clip_id not in ALLOWED:
        raise HTTPException(400, detail="clip_id must be '1' or '2'")

    media = Path(settings.MEDIA_DIR)
    source_dir = media / "sign_source"
    source_dir.mkdir(parents=True, exist_ok=True)

    suffix = Path(video.filename or "sample.webm").suffix.lower() or ".webm"
    if suffix not in {".webm", ".mp4", ".mov", ".mkv"}:
        suffix = ".webm"
    dest = source_dir / f"{clip_id}{suffix}"

    for old in source_dir.glob(f"{clip_id}.*"):
        try:
            old.unlink()
        except OSError:
            pass

    data = await video.read()
    if not data:
        raise HTTPException(400, detail="Empty upload")
    dest.write_bytes(data)
    log.info("Saved avatar sample %s (%d bytes)", dest, len(data))

    source_kind = "server"
    try:
        if landmarks is not None:
            raw = await landmarks.read()
            clip = json.loads(raw.decode("utf-8"))
            if not isinstance(clip, dict) or "frames" not in clip or "fps" not in clip:
                raise ValueError("landmarks JSON must have fps + frames")
            if not clip["frames"]:
                raise ValueError("landmarks JSON has no frames")
            source_kind = "client"
            (media / "landmarks").mkdir(parents=True, exist_ok=True)
            (media / "landmarks" / f"avatar-sample-{clip_id}.json").write_text(
                json.dumps(clip, separators=(",", ":")),
                encoding="utf-8",
            )
        else:
            clip = extract_clip(dest)
        out = write_landmarks(media, clip_id, clip)
    except Exception as exc:  # noqa: BLE001
        log.exception("Landmark save failed for %s", dest)
        raise HTTPException(500, detail=f"Landmark save failed: {exc}") from exc

    return {
        "clip_id": clip_id,
        "source": str(dest).replace("\\", "/"),
        "source_kind": source_kind,
        "landmarks": f"/media/sign_landmarks/{clip_id}.json",
        "frames": len(clip["frames"]),
        "fps": clip["fps"],
        "path": str(out).replace("\\", "/"),
    }
