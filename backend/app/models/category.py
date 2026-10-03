from sqlalchemy import Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    gestures: Mapped[list["Gesture"]] = relationship(back_populates="category")
    phrases: Mapped[list["Phrase"]] = relationship(back_populates="category")
