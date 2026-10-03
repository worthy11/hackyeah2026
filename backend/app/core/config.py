from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_NAME: str = "HackYeah API"
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@db:5432/app"
    # Comma-separated origins (Azure-friendly). JSON arrays are also accepted.
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        text = self.CORS_ORIGINS.strip()
        if not text:
            return []
        if text.startswith("["):
            import json

            try:
                parsed = json.loads(text)
                return [str(item) for item in parsed]
            except json.JSONDecodeError:
                inner = text.strip("[]")
                return [part.strip().strip("\"'") for part in inner.split(",") if part.strip()]
        return [part.strip() for part in text.split(",") if part.strip()]


settings = Settings()
