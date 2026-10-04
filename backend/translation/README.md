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

Model files are in git under `models/`; nothing to download:

```
models/
  classifier.pth, labels.json                                  # gloss classifier
  segmenter/config.json, model.safetensors, norm_mean.npy, norm_std.npy
```

`data/` is git-ignored and only holds local training data; the service does not need it.

Settings (`backend/.env` or environment):

| Variable | Default | |
| --- | --- | --- |
| `GEMINI_API_KEY` | empty | translation disabled when empty |
| `GEMINI_MODEL` | `gemini-3.8-flash` | |
| `SIGN_CLASSIFIER_DIR` | `models/` | alternative folder with `classifier.pth` + `labels.json` |
| `EXPECTED_GLOSSES` | `ja,imię,p,i,o,t,r` | sentence the bundled classifier is specialized for; empty = free recognition only |

## Bundled model and forced alignment

The bundled classifier knows exactly 7 signs: `ja`, `imię`, `p`, `i`, `o`, `t`, `r` ("ja imię Piotr").
With `EXPECTED_GLOSSES` set, `SignLanguagePipeline.align` places that sentence in the video (best ordered,
non-overlapping windows by classifier probability, `alignment.py`). The result is rejected, and free
recognition (segmenter → classifier) is used instead, when the mean probability is below 0.45 or any gloss
is below 0.15. In aligned results `confidence` is the probability of the expected gloss, so check it: weak
glosses (e.g. below 0.3) are the least bad match, not a detection.

Optional pipeline arguments: `recognize(..., expected_glosses=[...])` and `recognize(..., expected_signs=N)`
(merge the shortest segments until at most N remain).

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
- The classifier was trained on landmarks extracted with the settings in `landmarks.py` (15 fps, 480 px,
  MediaPipe complexity 0); changing them requires retraining.
