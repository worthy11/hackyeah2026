# translation

Polish Sign Language (PJM) video → gloss sequence → Polish sentence.

```
video ─► MediaPipe Holistic landmarks ─► segmenter (sign spans) ─► LSTM classifier (gloss per span) ─► Gemini (sentence)
```

## HTTP API

`POST /api/sign-language/translate` — multipart form, field `video` (mp4/webm/…).

```bash
curl -F "video=@clip.mp4" http://localhost:8000/api/sign-language/translate
```

```json
{
  "glosses": ["cześć", "jak się czujesz"],
  "translation": "Cześć, jak się czujesz?",
  "signs": [
    {"gloss": "cześć", "confidence": 0.87, "start_frame": 9, "end_frame": 43},
    {"gloss": "jak się czujesz", "confidence": 0.9, "start_frame": 43, "end_frame": 99}
  ],
  "fps": 30.0,
  "n_frames": 111,
  "debug": null
}
```

- `translation` is `null` if `GEMINI_API_KEY` is unset or the Gemini call fails (reason in the server log), `""` if no signs were found.
- `?debug=true` adds per-frame landmarks and raw segmenter spans.
- `422` if the video cannot be decoded.

## Setup

Model files are not in git; put them in `data/`:

```
data/
  classifier.pth, labels.json                                  # gloss classifier
  segmenter/config.json, model.safetensors, norm_mean.npy, norm_std.npy
```

Settings (`backend/.env` or environment):

| Variable | Default | |
| --- | --- | --- |
| `GEMINI_API_KEY` | empty | translation disabled when empty |
| `GEMINI_MODEL` | `gemini-3.8-flash` | |
| `SIGN_CLASSIFIER_DIR` | `data/` | alternative folder with `classifier.pth` + `labels.json` |

## Python

```python
from translation import GeminiTranslator, SignLanguagePipeline

pipeline = SignLanguagePipeline(translator=GeminiTranslator(api_key))  # translator is optional
result = pipeline.recognize("clip.mp4")
result.glosses, result.translation
```

Loading takes a few seconds; create the pipeline once and reuse it.

## Input expectations

- Unmirrored video, signer facing the camera, both hands in frame for the whole sign.
- Only glosses listed in `labels.json` can be recognized.
