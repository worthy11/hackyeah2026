"""Minimal CNN+RoPE pose tagger for inference (no Lightning / training code)."""
from __future__ import annotations

from collections import namedtuple
from typing import List

import torch
import torch.nn as nn
import torch.nn.functional as F

ConvDef = namedtuple("ConvDef", ["in_channels", "out_channels", "kernel_size", "stride"])

BIO = {"UNK": 0, "O": 1, "B": 2, "I": 3}


class PoseEncoderUNetBlock(nn.Module):
    def __init__(self, input_size: int, output_size: int, convolutions: List[ConvDef]):
        super().__init__()
        self.encoder_layers = nn.ModuleList()
        for conv in convolutions:
            self.encoder_layers.append(
                nn.Sequential(
                    nn.Conv1d(
                        in_channels=conv.in_channels,
                        out_channels=conv.out_channels,
                        kernel_size=conv.kernel_size,
                        stride=conv.stride,
                        padding=conv.kernel_size // 2,
                    ),
                    nn.BatchNorm1d(conv.out_channels),
                    nn.SiLU(),
                )
            )

        self.decoder_layers = nn.ModuleList()
        for conv in reversed(convolutions):
            self.decoder_layers.append(
                nn.Sequential(
                    nn.ConvTranspose1d(
                        in_channels=conv.out_channels,
                        out_channels=conv.in_channels,
                        kernel_size=conv.kernel_size,
                        stride=conv.stride,
                        padding=conv.kernel_size // 2,
                    ),
                    nn.BatchNorm1d(conv.in_channels),
                    nn.SiLU(),
                )
            )
        self.fc = nn.Linear(input_size, output_size)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        batch_size, sequence_length, input_size, input_channels = x.shape
        x = x.permute(0, 2, 3, 1).contiguous()
        x = x.view(batch_size * input_size, input_channels, sequence_length)

        intermediate_values = []
        for layer in self.encoder_layers:
            x = layer(x)
            intermediate_values.append(x)

        for layer in self.decoder_layers:
            skip = intermediate_values.pop()
            diff = skip.shape[-1] - x.shape[-1]
            if diff > 0:
                left_pad = diff // 2
                right_pad = diff - left_pad
                x = F.pad(x, (left_pad, right_pad), mode="constant", value=0)
            x = layer(x + skip)

        _, output_channels, new_sequence_length = x.shape
        x = x.view(batch_size, input_size, output_channels, new_sequence_length).permute(0, 3, 1, 2)
        x = x.mean(dim=-1)
        return self.fc(x)


class Unsqueeze(nn.Module):
    def __init__(self, dim: int):
        super().__init__()
        self.dim = dim

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return x.unsqueeze(self.dim)


class RoPETransformerEncoderLayer(nn.Module):
    REFERENCE_FPS = 50.0

    def __init__(self, hidden_dim: int, nhead: int, dim_feedforward: int, dropout: float = 0.1):
        super().__init__()
        assert hidden_dim % nhead == 0
        self.nhead = nhead
        self.head_dim = hidden_dim // nhead
        self.norm1 = nn.RMSNorm(hidden_dim)
        self.norm2 = nn.RMSNorm(hidden_dim)
        self.qkv = nn.Linear(hidden_dim, 3 * hidden_dim, bias=False)
        self.out_proj = nn.Linear(hidden_dim, hidden_dim, bias=False)
        self.attn_drop = nn.Dropout(dropout)
        self.ffn = nn.Sequential(
            nn.Linear(hidden_dim, dim_feedforward),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(dim_feedforward, hidden_dim),
            nn.Dropout(dropout),
        )
        inv_freq = 1.0 / (10000.0 ** (torch.arange(0, self.head_dim, 2).float() / self.head_dim))
        self.register_buffer("inv_freq", inv_freq)

    @staticmethod
    def _rotate_half(x: torch.Tensor) -> torch.Tensor:
        x1, x2 = x[..., : x.shape[-1] // 2], x[..., x.shape[-1] // 2 :]
        return torch.cat([-x2, x1], dim=-1)

    def _compute_rope(self, timestamps: torch.Tensor):
        if timestamps.dim() == 1:
            timestamps = timestamps.unsqueeze(0)
        freqs = (timestamps * self.REFERENCE_FPS).unsqueeze(-1).float() * self.inv_freq
        emb = torch.cat([freqs, freqs], dim=-1)
        return emb.cos().unsqueeze(1), emb.sin().unsqueeze(1)

    def forward(self, x: torch.Tensor, timestamps: torch.Tensor | None = None) -> torch.Tensor:
        b, t, d = x.shape
        if timestamps is None:
            timestamps = torch.arange(t, device=x.device, dtype=torch.float32)
        cos, sin = self._compute_rope(timestamps)

        h = self.norm1(x)
        qkv = self.qkv(h).reshape(b, t, 3, self.nhead, self.head_dim)
        q, k, v = qkv.unbind(2)
        q = q.transpose(1, 2)
        k = k.transpose(1, 2)
        v = v.transpose(1, 2)
        q = q * cos + self._rotate_half(q) * sin
        k = k * cos + self._rotate_half(k) * sin
        attn_out = F.scaled_dot_product_attention(
            q, k, v, dropout_p=self.attn_drop.p if self.training else 0.0
        )
        x = x + self.out_proj(attn_out.transpose(1, 2).reshape(b, t, d))
        x = x + self.ffn(self.norm2(x))
        return x


class ClassifierHead(nn.Module):
    def __init__(self, hidden_dim: int, num_classes: int):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.GELU(),
            nn.Linear(hidden_dim, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


class PoseSignModel(nn.Module):
    """Inference-only CNN-medium-attn + RoPE sign/sentence BIO tagger."""

    REFERENCE_FPS = RoPETransformerEncoderLayer.REFERENCE_FPS

    def __init__(
        self,
        pose_dims: tuple[int, int] = (50, 6),
        hidden_dim: int = 384,
        encoder_depth: int = 4,
        num_classes: int = 4,
        attn_nhead: int = 8,
        attn_ff_mult: int = 2,
        attn_dropout: float = 0.1,
        num_frames: int = 1024,
        **_ignored,
    ):
        super().__init__()
        self.num_frames = num_frames
        self.frame_cnn = nn.Sequential(
            PoseEncoderUNetBlock(
                input_size=pose_dims[0],
                output_size=hidden_dim,
                convolutions=[
                    ConvDef(in_channels=pose_dims[1], out_channels=16, kernel_size=5, stride=1),
                    ConvDef(in_channels=16, out_channels=32, kernel_size=11, stride=1),
                    ConvDef(in_channels=32, out_channels=64, kernel_size=21, stride=2),
                ],
            ),
            Unsqueeze(dim=-1),
            PoseEncoderUNetBlock(
                input_size=hidden_dim,
                output_size=hidden_dim,
                convolutions=[
                    ConvDef(in_channels=1, out_channels=16, kernel_size=5, stride=1),
                    ConvDef(in_channels=16, out_channels=32, kernel_size=11, stride=2),
                    ConvDef(in_channels=32, out_channels=64, kernel_size=21, stride=2),
                    ConvDef(in_channels=64, out_channels=128, kernel_size=21, stride=2),
                ],
            ),
        )
        self.input_norm = nn.RMSNorm(hidden_dim)
        self.encoder_attn = nn.ModuleList(
            [
                RoPETransformerEncoderLayer(
                    hidden_dim, attn_nhead, hidden_dim * attn_ff_mult, attn_dropout
                )
                for _ in range(encoder_depth)
            ]
        )
        self.sign_bio_head = ClassifierHead(hidden_dim, num_classes)
        self.sentence_bio_head = ClassifierHead(hidden_dim, num_classes)

    def encode(self, pose_data: torch.Tensor, timestamps: torch.Tensor | None = None) -> torch.Tensor:
        x = self.input_norm(self.frame_cnn(pose_data))
        b, t, _ = x.shape
        if timestamps is None:
            ts = (
                torch.arange(t, device=x.device, dtype=torch.float32) / self.REFERENCE_FPS
            ).unsqueeze(0).expand(b, -1)
        else:
            ts = timestamps.to(x.device)
            if ts.dim() == 1:
                ts = ts.unsqueeze(0).expand(b, -1)

        chunk_size = self.num_frames
        if t <= chunk_size:
            for layer in self.encoder_attn:
                x = layer(x, ts)
            return x

        n_chunks = (t + chunk_size - 1) // chunk_size
        pad_len = n_chunks * chunk_size - t
        x_pad = F.pad(x, (0, 0, 0, pad_len))
        ts_pad = F.pad(ts, (0, pad_len))
        x_chunks = x_pad.reshape(n_chunks, chunk_size, x_pad.shape[-1])
        ts_chunks = ts_pad.reshape(n_chunks, chunk_size)
        for layer in self.encoder_attn:
            x_chunks = layer(x_chunks, ts_chunks)
        return x_chunks.reshape(1, n_chunks * chunk_size, x_pad.shape[-1])[:, :t]

    def forward(self, pose_data: torch.Tensor, timestamps: torch.Tensor | None = None) -> dict:
        encoded = self.encode(pose_data, timestamps)
        return {
            "sign": F.log_softmax(self.sign_bio_head(encoded), dim=-1),
            "sentence": F.log_softmax(self.sentence_bio_head(encoded), dim=-1),
        }
