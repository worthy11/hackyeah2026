import shutil
import tempfile
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from app.core.config import settings
from translation import GeminiTranslator, RecognitionResult, SignLanguagePipeline

router = APIRouter(prefix="/sign-language", tags=["sign-language"])


@lru_cache(maxsize=1)
def get_pipeline() -> SignLanguagePipeline:
    translator = GeminiTranslator(settings.GEMINI_API_KEY, settings.GEMINI_MODEL) if settings.GEMINI_API_KEY else None
    return SignLanguagePipeline(translator=translator)


@router.post("/translate")
def translate(video: UploadFile, debug: bool = False) -> RecognitionResult:
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
            return get_pipeline().recognize(video_path, debug=debug)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
