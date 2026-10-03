"""Sign language video -> gloss sequence.

    from sign_language_processing import get_pipeline

    result = get_pipeline().recognize("video.mp4")
    result.glosses  # ["dzien dobry", "ja", ...]
    result.signs    # per sign: gloss, confidence, start_frame, end_frame

Model files are expected in `data/` (git-ignored):
    classifier.pth, labels.json,
    segmenter/{config.json, model.safetensors, norm_mean.npy, norm_std.npy}
"""

from .pipeline import DetectedSign, RecognitionResult, SignLanguagePipeline, get_pipeline

__all__ = ["DetectedSign", "RecognitionResult", "SignLanguagePipeline", "get_pipeline"]
