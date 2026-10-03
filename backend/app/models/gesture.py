from datetime import datetime

from sqlalchemy import ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Gesture(Base):
    __tablename__ = "gestures"

    id: Mapped[int] = mapped_column(primary_key=True)
    gloss: Mapped[str] = mapped_column(Text, nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    # Local filesystem path (relative to a media volume mount, e.g. /media/gestures/)
    video_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    category: Mapped["Category"] = relationship(back_populates="gestures")
    phrase_gestures: Mapped[list["PhraseGesture"]] = relationship(back_populates="gesture")
