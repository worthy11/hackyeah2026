"""Gloss sequence -> Polish sentence with the Gemini API."""
import json
import logging

import httpx

logger = logging.getLogger(__name__)

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_MODEL = "gemini-3.8-flash"
INSTRUCTION = (
    "Jesteś tłumaczem polskiego języka migowego (PJM). Dostajesz listę gestów rozpoznanych w nagraniu, "
    "w kolejności migania. Przetłumacz je na poprawne, naturalne zdanie po polsku, z właściwą odmianą, "
    "szykiem i interpunkcją. Zwróć wyłącznie to zdanie, bez komentarzy, wyjaśnień ani cudzysłowów."
)


class GeminiTranslator:
    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, timeout_seconds: float = 30):
        self.api_key = api_key
        self.model = model
        self.timeout_seconds = timeout_seconds

    def translate(self, glosses: list[str]) -> str | None:
        """Polish sentence for the glosses; None if the API call fails."""
        if not glosses:
            return ""
        request = {
            "systemInstruction": {"parts": [{"text": INSTRUCTION}]},
            "contents": [{"role": "user", "parts": [{"text": json.dumps(glosses, ensure_ascii=False)}]}],
            "generationConfig": {"thinkingConfig": {"thinkingLevel": "low"}},
        }
        try:
            response = httpx.post(
                API_URL.format(model=self.model),
                headers={"x-goog-api-key": self.api_key},
                json=request,
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            parts = response.json()["candidates"][0]["content"]["parts"]
        except (httpx.HTTPError, KeyError, IndexError) as error:
            details = error.response.text if isinstance(error, httpx.HTTPStatusError) else error
            logger.warning("Gemini translation failed: %s", details)
            return None
        return "".join(part.get("text", "") for part in parts if not part.get("thought")).strip()
