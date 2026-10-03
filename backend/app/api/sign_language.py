import shutil
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import APIRouter, HTTPException, UploadFile

from app.core.config import settings

if TYPE_CHECKING:
    from translation import RecognitionResult, SignLanguagePipeline

router = APIRouter(prefix="/sign-language", tags=["sign-language"])

# Lazy-load the ML pipeline so the server starts even when native DLLs
# (torch / mediapipe) fail to initialise on this platform.
_pipeline_error: Exception | None = None
_pipeline_instance: "SignLanguagePipeline | None" = None


@lru_cache(maxsize=1)
def get_pipeline() -> "SignLanguagePipeline":
    global _pipeline_error, _pipeline_instance
    if _pipeline_error is not None:
        raise _pipeline_error
    try:
        from translation import GeminiTranslator, SignLanguagePipeline  # noqa: PLC0415
        translator = GeminiTranslator(settings.GEMINI_API_KEY, settings.GEMINI_MODEL) if settings.GEMINI_API_KEY else None
        _pipeline_instance = SignLanguagePipeline(translator=translator)
        return _pipeline_instance
    except Exception as exc:
        _pipeline_error = exc
        raise


@router.post("/translate")
def translate(video: UploadFile, debug: bool = False):
    """Sign language video (multipart field `video`) -> recognized glosses + Polish translation.

    `translation` is null when GEMINI_API_KEY is not set or the Gemini call fails.
    `debug=true` adds per-frame landmarks and raw segmenter output.
    """
    suffix = Path(video.filename or "").suffix or ".mp4"
    with tempfile.TemporaryDirectory() as tmp_dir:
        video_path = Path(tmp_dir) / f"upload{suffix}"
        with video_path.open("wb") as file:
            shutil.copyfileobj(video.file, file)
        try:
            pipeline = get_pipeline()
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"ML pipeline unavailable: {exc}") from exc
        try:
            return pipeline.recognize(video_path, debug=debug)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
