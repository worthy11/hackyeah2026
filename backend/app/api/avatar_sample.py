"""Upload a signing sample and regenerate avatar landmark JSON."""
from __future__ import annotations

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

    # Drop older sources for this clip id so resolve picks the new one.
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

    try:
        clip = extract_clip(dest)
        out = write_landmarks(media, clip_id, clip)
    except Exception as exc:  # noqa: BLE001
        log.exception("Landmark extract failed for %s", dest)
        raise HTTPException(500, detail=f"Landmark extract failed: {exc}") from exc

    return {
        "clip_id": clip_id,
        "source": str(dest).replace("\\", "/"),
        "landmarks": f"/media/sign_landmarks/{clip_id}.json",
        "frames": len(clip["frames"]),
        "fps": clip["fps"],
        "path": str(out).replace("\\", "/"),
    }
