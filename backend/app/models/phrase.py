from datetime import datetime

from sqlalchemy import ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PhraseGesture(Base):
    """Ordered junction between Phrase and Gesture."""

    __tablename__ = "phrase_gestures"
    __table_args__ = (UniqueConstraint("phrase_id", "position", name="uq_phrase_position"),)

    phrase_id: Mapped[int] = mapped_column(ForeignKey("phrases.id", ondelete="CASCADE"), primary_key=True)
    gesture_id: Mapped[int] = mapped_column(ForeignKey("gestures.id", ondelete="RESTRICT"), primary_key=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    phrase: Mapped["Phrase"] = relationship(back_populates="phrase_gestures")
    gesture: Mapped["Gesture"] = relationship(back_populates="phrase_gestures")


class Phrase(Base):
    __tablename__ = "phrases"

    id: Mapped[int] = mapped_column(primary_key=True)
    translation: Mapped[str] = mapped_column(Text, nullable=False)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now(), nullable=False)

    category: Mapped["Category"] = relationship(back_populates="phrases")
    phrase_gestures: Mapped[list["PhraseGesture"]] = relationship(
        back_populates="phrase",
        order_by="PhraseGesture.position",
        cascade="all, delete-orphan",
    )
