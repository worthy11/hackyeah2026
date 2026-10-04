import logging
import os
import warnings
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # so SIGN_CLASSIFIER_* etc. are in os.environ for the ML pipeline

# Quiet MediaPipe / absl / protobuf noise before those libs are imported.
os.environ.setdefault("GLOG_minloglevel", "2")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
warnings.filterwarnings("ignore", message="SymbolDatabase.GetPrototype")
logging.getLogger("absl").setLevel(logging.ERROR)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.avatar_sample import router as avatar_sample_router
from app.api.contributions import router as contributions_router
from app.api.routes import router as api_router
from app.api.sign_language import router as sign_language_router
from app.api.ws_translate import ws_translate
from app.core.config import settings

log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Load classifier + warm MediaPipe once at boot so the first request isn't cold."""
    try:
        from app.api.sign_language import get_pipeline
        from translation.landmarks import warm_holistic

        pipeline = get_pipeline()
        warm_holistic()
        log.info(
            "ML pipeline ready  weights=%s  labels=%s",
            getattr(pipeline, "classifier_weights", "?"),
            getattr(pipeline, "classifier_labels", "?"),
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("ML warm-up skipped: %s", exc)

    try:
        from translation.precompute_avatar_landmarks import ensure_avatar_landmarks

        ensure_avatar_landmarks(settings.MEDIA_DIR)
    except Exception as exc:  # noqa: BLE001
        log.warning("Avatar landmark precompute skipped: %s", exc)
    yield


app = FastAPI(title=settings.APP_NAME, version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(sign_language_router, prefix="/api")
app.include_router(contributions_router, prefix="/api")
app.include_router(avatar_sample_router, prefix="/api")

app.add_api_websocket_route("/ws/translate", ws_translate)

# Serve uploaded media (videos + landmark JSON files)
_media = Path(settings.MEDIA_DIR)
_media.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(_media)), name="media")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
