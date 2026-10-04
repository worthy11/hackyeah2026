"""Gloss sequence -> Polish sentence with the Gemini API."""
from __future__ import annotations

import json
import logging
from collections.abc import Iterator

import httpx

logger = logging.getLogger(__name__)

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
STREAM_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent"
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

    def _request_body(self, glosses: list[str]) -> dict:
        return {
            "systemInstruction": {"parts": [{"text": INSTRUCTION}]},
            "contents": [{"role": "user", "parts": [{"text": json.dumps(glosses, ensure_ascii=False)}]}],
            "generationConfig": {"thinkingConfig": {"thinkingLevel": "low"}},
        }

    @staticmethod
    def _text_from_chunk(payload: dict) -> str:
        try:
            parts = payload["candidates"][0]["content"]["parts"]
        except (KeyError, IndexError, TypeError):
            return ""
        return "".join(part.get("text", "") for part in parts if not part.get("thought"))

    def translate(self, glosses: list[str]) -> str | None:
        """Polish sentence for the glosses; None if the API call fails."""
        if not glosses:
            return ""
        try:
            response = httpx.post(
                API_URL.format(model=self.model),
                headers={"x-goog-api-key": self.api_key},
                json=self._request_body(glosses),
                timeout=self.timeout_seconds,
            )
            response.raise_for_status()
            return self._text_from_chunk(response.json()).strip() or None
        except (httpx.HTTPError, KeyError, IndexError) as error:
            details = error.response.text if isinstance(error, httpx.HTTPStatusError) else error
            logger.warning("Gemini translation failed: %s", details)
            return None

    def translate_stream(self, glosses: list[str]) -> Iterator[str]:
        """Yield text deltas as Gemini streams the Polish sentence."""
        if not glosses:
            return
        try:
            with httpx.stream(
                "POST",
                STREAM_URL.format(model=self.model),
                params={"alt": "sse"},
                headers={"x-goog-api-key": self.api_key},
                json=self._request_body(glosses),
                timeout=self.timeout_seconds,
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    if line.startswith("data: "):
                        line = line[6:]
                    if line.strip() in ("[DONE]", ""):
                        continue
                    try:
                        payload = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    delta = self._text_from_chunk(payload)
                    if delta:
                        yield delta
        except httpx.HTTPError as error:
            details = error.response.text if isinstance(error, httpx.HTTPStatusError) else error
            logger.warning("Gemini stream failed: %s", details)
            # Fall back to non-streaming so the UI still gets a sentence.
            full = self.translate(glosses)
            if full:
                yield full
