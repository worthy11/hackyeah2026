from datetime import datetime

from sqlalchemy import Float, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Gesture(Base):
    __tablename__ = "gestures"

    id: Mapped[int] = mapped_column(primary_key=True)
    gloss: Mapped[str] = mapped_column(Text, nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    # Full video file path on the media volume
    video_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Optional sub-clip range within video_path (for segments extracted from phrase videos)
    start_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    end_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Path to extracted MediaPipe landmark JSON
    landmarks_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    category: Mapped["Category"] = relationship(back_populates="gestures")
    phrase_gestures: Mapped[list["PhraseGesture"]] = relationship(back_populates="gesture")
