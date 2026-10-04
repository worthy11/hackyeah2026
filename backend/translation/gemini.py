"""Gloss sequence -> Polish sentence with the Gemini API."""
import json
import logging
import time

import httpx

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 4
RETRY_DELAY_SECONDS = 1.5  # grows linearly with the attempt number
RETRY_STATUSES = {500, 503, 504}  # not 429: that is usually the daily quota, which a retry cannot fix

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_MODEL = "gemini-3.8-flash"
INSTRUCTION = (
    "Jesteś tłumaczem polskiego języka migowego (PJM). Dostajesz listę gestów rozpoznanych w nagraniu, "
    "w kolejności migania. Przetłumacz je na poprawne, naturalne zdanie po polsku, z właściwą odmianą, "
    "szykiem i interpunkcją. Pojedyncze litery (a-z) to literowanie palcowe: kolejne litery tworzą jedno "
    "słowo, najczęściej imię, nazwisko lub nazwę własną (np. [\"j\", \"a\", \"n\"] to \"Jan\"). Złóż je w "
    "słowo, zapisz wielką literą, jeśli to nazwa własna, i wstaw w zdanie; litery nie niosą polskich "
    "znaków, więc w razie potrzeby uzupełnij je (np. \"lukasz\" to \"Łukasz\"). "
    "Zwróć wyłącznie to zdanie, bez komentarzy, wyjaśnień ani cudzysłowów."
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
        for attempt in range(1, MAX_ATTEMPTS + 1):
            try:
                response = httpx.post(
                    API_URL.format(model=self.model),
                    headers={"x-goog-api-key": self.api_key},
                    json=request,
                    timeout=self.timeout_seconds,
                )
                response.raise_for_status()
                parts = response.json()["candidates"][0]["content"]["parts"]
                break
            except (httpx.HTTPError, KeyError, IndexError) as error:
                details = error.response.text if isinstance(error, httpx.HTTPStatusError) else error
                logger.warning("Gemini translation failed (attempt %d/%d): %s", attempt, MAX_ATTEMPTS, details)
                retryable = not isinstance(error, httpx.HTTPStatusError) or error.response.status_code in RETRY_STATUSES
                if attempt == MAX_ATTEMPTS or not retryable:
                    return None
                time.sleep(RETRY_DELAY_SECONDS * attempt)
        return "".join(part.get("text", "") for part in parts if not part.get("thought")).strip()
