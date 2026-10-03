import shutil
import tempfile
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from sign_language_processing import RecognitionResult, get_pipeline

router = APIRouter(prefix="/sign-language", tags=["sign-language"])


@router.post("/recognize")
def recognize(video: UploadFile, debug: bool = False) -> RecognitionResult:
    """Recognize the gloss sequence in an uploaded video. `debug=true` adds per-frame landmarks."""
    suffix = Path(video.filename or "").suffix or ".mp4"
    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = Path(tmp_dir) / f"upload{suffix}"
        with video_path.open("wb") as file:
            shutil.copyfileobj(video.file, file)
        try:
            return get_pipeline().recognize(video_path, debug=debug)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
