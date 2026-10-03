from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.contributions import router as contributions_router
from app.api.routes import router as api_router
from app.api.sign_language import router as sign_language_router
from app.core.config import settings

app = FastAPI(title=settings.APP_NAME, version="0.1.0")

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

# Serve uploaded media (videos + landmark JSON files)
_media = Path(settings.MEDIA_DIR)
_media.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(_media)), name="media")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
