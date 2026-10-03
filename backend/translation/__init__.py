"""Sign language video -> gloss sequence -> Polish sentence.

    from translation import GeminiTranslator, SignLanguagePipeline

    pipeline = SignLanguagePipeline(translator=GeminiTranslator(api_key))  # translator is optional
    result = pipeline.recognize("video.mp4")
    result.glosses      # ["cześć", "jak się czujesz"]
    result.translation  # "Cześć, jak się czujesz?"
    result.signs        # per sign: gloss, confidence, start_frame, end_frame

Model files are in `models/`:
    classifier.pth, labels.json,
    segmenter/{config.json, model.safetensors, norm_mean.npy, norm_std.npy}
"""

from .pipeline import DetectedSign, RecognitionResult, SignLanguagePipeline
from .gemini import GeminiTranslator

__all__ = ["DetectedSign", "GeminiTranslator", "RecognitionResult", "SignLanguagePipeline"]
