"""Isolated sign (gloss) classification."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

END_CUTOFF = 0.2
# Training randomly dropped half of the webcam frames, so the model expects roughly this rate.
MODEL_FPS = 15
BODY_PARTS = (slice(0, 33), slice(33, 54), slice(54, 75))


class LSTMClassifier(nn.Module):
    def __init__(self, input_size: int, hidden_size: int, num_layers: int, num_classes: int):
        super().__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_size, num_classes)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.fc(self.lstm(x)[0][:, -1])


def preprocess(landmarks: torch.Tensor) -> torch.Tensor:
    """(T, 75, 3) landmarks -> (3T', 225) model input; must match the training transforms exactly."""
    x = landmarks[: len(landmarks) - int(END_CUTOFF * len(landmarks))]
    normalized = []
    for part in BODY_PARTS:
        low = x[:, part].amin(dim=1, keepdim=True)
        span = x[:, part].amax(dim=1, keepdim=True) - low
        span[span == 0] = 1.0
        normalized.append((x - low) / span)
    return torch.cat(normalized, dim=1).reshape(-1, 225)


class GlossClassifier:
    def __init__(self, weights_path: Path, labels_path: Path, device: str = "cpu"):
        self.device = device
        state = torch.load(weights_path, map_location=device)
        hidden_size, input_size = state["lstm.weight_hh_l0"].shape[1], state["lstm.weight_ih_l0"].shape[1]
        num_layers = sum(key.startswith("lstm.weight_ih_l") for key in state)
        self.model = LSTMClassifier(input_size, hidden_size, num_layers, len(state["fc.bias"]))
        self.model.load_state_dict(state)
        self.model.to(device).eval()
        label_to_index = json.loads(labels_path.read_text(encoding="utf-8"))
        self.labels = {index: label for label, index in label_to_index.items()}

    @torch.inference_mode()
    def classify(self, landmarks: np.ndarray, fps: float) -> tuple[str, float]:
        """Return the most likely gloss and its probability for a (T, 75, 3) landmark clip."""
        step = max(1, round(fps / MODEL_FPS))
        x = preprocess(torch.from_numpy(landmarks[::step].copy())).to(self.device)
        probs = self.model(x[None]).softmax(dim=-1)[0]
        confidence, index = probs.max(dim=0)
        return self.labels[index.item()], confidence.item()
