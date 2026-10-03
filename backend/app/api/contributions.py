"""Contributor endpoints: upload gesture/phrase videos, serve gesture index."""
from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.category import Category
from app.models.gesture import Gesture
from app.models.phrase import Phrase, PhraseGesture

router = APIRouter(prefix="/contributions", tags=["contributions"])


# ── helpers ───────────────────────────────────────────────────────────────────

def _media_dir() -> Path:
    p = Path(settings.MEDIA_DIR)
    (p / "videos").mkdir(parents=True, exist_ok=True)
    (p / "landmarks").mkdir(parents=True, exist_ok=True)
    return p


def _extract_landmarks(video_path: Path, gesture_id: int,
                       start_ms: float | None = None,
                       end_ms: float | None = None) -> Path | None:
    """Run MediaPipe on a video (or sub-clip) and write landmarks JSON. Best-effort."""
    try:
        import cv2  # noqa: PLC0415
        from translation.landmarks import classifier_landmarks, extract_pose  # noqa: PLC0415

        if start_ms is not None or end_ms is not None:
            # Extract sub-clip into a temp file
            cap = cv2.VideoCapture(str(video_path))
            fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            start_frame = int((start_ms or 0) / 1000 * fps)
            end_frame   = int((end_ms or 1e9) / 1000 * fps)
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                tmp_path = Path(tmp.name)
            writer = cv2.VideoWriter(str(tmp_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)
            for _ in range(end_frame - start_frame):
                ok, frame = cap.read()
                if not ok:
                    break
                writer.write(frame)
            cap.release()
            writer.release()
            source = tmp_path
        else:
            source = video_path

        pose = extract_pose(source)
        arr  = classifier_landmarks(pose)
        data = {"fps": float(pose.body.fps), "frames": arr.tolist()}
        out  = _media_dir() / "landmarks" / f"{gesture_id}.json"
        out.write_text(json.dumps(data, separators=(",", ":")))
        if start_ms is not None:
            tmp_path.unlink(missing_ok=True)
        return out
    except Exception as exc:
        print(f"[contributions] landmark extraction failed for gesture {gesture_id}: {exc}")
        return None


ALLOWED = {".mp4", ".webm", ".mov", ".avi"}


# ── response models ───────────────────────────────────────────────────────────

class GestureOut(BaseModel):
    id: int
    gloss: str
    category_id: int
    video_url: str
    start_ms: float | None
    end_ms: float | None
    landmarks_url: str | None

    model_config = {"from_attributes": True}


class CategoryOut(BaseModel):
    id: int
    name: str
    description: str | None
    model_config = {"from_attributes": True}


# ── categories ────────────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryOut], tags=["learning"])
def list_categories(db: Session = Depends(get_db)):
    return db.query(Category).order_by(Category.id).all()


# ── gesture list ──────────────────────────────────────────────────────────────

def _gesture_to_out(g: Gesture) -> GestureOut:
    suffix = Path(g.video_path).suffix if g.video_path else ".webm"
    lm = Path(settings.MEDIA_DIR) / "landmarks" / f"{g.id}.json"
    return GestureOut(
        id=g.id,
        gloss=g.gloss,
        category_id=g.category_id,
        video_url=f"/media/videos/{Path(g.video_path).name}" if g.video_path else "",
        start_ms=g.start_ms,
        end_ms=g.end_ms,
        landmarks_url=f"/media/landmarks/{g.id}.json" if lm.exists() else None,
    )


def _load_hardcoded() -> list[GestureOut]:
    """Read media/gestures.json and return GestureOut entries for every video_file that exists."""
    config = Path(settings.MEDIA_DIR) / "gestures.json"
    if not config.exists():
        return []
    try:
        entries = json.loads(config.read_text(encoding="utf-8"))
    except Exception:
        return []

    out: list[GestureOut] = []
    videos_dir = Path(settings.MEDIA_DIR) / "videos"
    for e in entries:
        vf = e.get("video_file")
        if not vf:
            continue
        video_path = videos_dir / vf
        if not video_path.exists():
            continue                        # skip until the file is actually placed
        lf = e.get("landmarks_file")
        landmarks_url = f"/media/landmarks/{lf}" if lf and (Path(settings.MEDIA_DIR) / "landmarks" / lf).exists() else None
        out.append(GestureOut(
            id=e["id"],
            gloss=str(e["gloss"]).strip().upper(),
            category_id=int(e["category_id"]),
            video_url=f"/media/videos/{vf}",
            start_ms=e.get("start_ms"),
            end_ms=e.get("end_ms"),
            landmarks_url=landmarks_url,
        ))
    return out


@router.get("/gestures", response_model=list[GestureOut], tags=["learning"])
def list_gestures(category_id: int | None = None, db: Session = Depends(get_db)):
    # Hardcoded gestures (no DB required) — read from media/gestures.json
    results: list[GestureOut] = _load_hardcoded()

    # DB gestures (silently skipped if DB is unavailable)
    try:
        q = db.query(Gesture)
        if category_id is not None:
            q = q.filter(Gesture.category_id == category_id)
        results += [_gesture_to_out(g) for g in q.order_by(Gesture.created_at).all()]
    except Exception:
        pass

    if category_id is not None:
        results = [r for r in results if r.category_id == category_id]
    return results


# ── upload: single gesture ────────────────────────────────────────────────────

@router.post("/upload/gesture", response_model=GestureOut)
def upload_gesture(
    video: UploadFile,
    gloss: str = Form(...),
    category_id: int = Form(...),
    db: Session = Depends(get_db),
):
    suffix = Path(video.filename or "").suffix or ".webm"
    if suffix.lower() not in ALLOWED:
        raise HTTPException(422, f"Unsupported format: {suffix}")

    gesture = Gesture(gloss=gloss.strip().upper(), category_id=category_id)
    db.add(gesture); db.flush()

    video_path = _media_dir() / "videos" / f"{gesture.id}{suffix}"
    with video_path.open("wb") as f:
        shutil.copyfileobj(video.file, f)
    gesture.video_path = str(video_path)
    db.flush()

    lm = _extract_landmarks(video_path, gesture.id)
    if lm:
        gesture.landmarks_path = str(lm)

    db.commit(); db.refresh(gesture)
    return _gesture_to_out(gesture)


# ── Segment schema for phrase uploads ─────────────────────────────────────────

class Segment(BaseModel):
    gloss: str
    start_ms: float
    end_ms: float


class PhraseUploadBody(BaseModel):
    translation: str
    category_id: int
    segments: list[Segment]


# ── upload: phrase with segments ──────────────────────────────────────────────

@router.post("/upload/phrase")
def upload_phrase(
    video: UploadFile,
    translation: str = Form(...),
    category_id: int = Form(...),
    segments_json: str = Form(...),   # JSON-encoded list of Segment dicts
    db: Session = Depends(get_db),
):
    """Upload a phrase video with time-coded gesture segments.

    `segments_json` must be a JSON array: [{"gloss":"X","start_ms":0,"end_ms":1200}, ...]
    """
    try:
        segments = [Segment(**s) for s in json.loads(segments_json)]
    except Exception:
        raise HTTPException(422, "segments_json is not valid JSON")

    if not segments:
        raise HTTPException(422, "At least one segment is required")

    suffix = Path(video.filename or "").suffix or ".webm"
    if suffix.lower() not in ALLOWED:
        raise HTTPException(422, f"Unsupported format: {suffix}")

    # Save full video once (all gesture clips reference it)
    import uuid  # noqa: PLC0415
    video_filename = f"phrase_{uuid.uuid4().hex}{suffix}"
    video_path = _media_dir() / "videos" / video_filename
    with video_path.open("wb") as f:
        shutil.copyfileobj(video.file, f)

    # Create gesture records for each segment
    gesture_ids: list[int] = []
    for seg in segments:
        g = Gesture(
            gloss=seg.gloss.strip().upper(),
            category_id=category_id,
            video_path=str(video_path),
            start_ms=seg.start_ms,
            end_ms=seg.end_ms,
        )
        db.add(g); db.flush()
        lm = _extract_landmarks(video_path, g.id, seg.start_ms, seg.end_ms)
        if lm:
            g.landmarks_path = str(lm)
        gesture_ids.append(g.id)

    # Create phrase record
    phrase = Phrase(translation=translation.strip(), category_id=category_id)
    db.add(phrase); db.flush()
    for pos, gid in enumerate(gesture_ids):
        db.add(PhraseGesture(phrase_id=phrase.id, gesture_id=gid, position=pos))

    db.commit()

    return {
        "phrase_id": phrase.id,
        "gesture_count": len(gesture_ids),
        "gesture_ids": gesture_ids,
    }
