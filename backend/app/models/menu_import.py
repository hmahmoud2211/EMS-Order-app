import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamps, UUIDPrimaryKey
from app.models.enums import ImportSourceType, ImportStatus, enum_values


class MenuImport(UUIDPrimaryKey, Timestamps, Base):
    __tablename__ = "menu_imports"
    __table_args__ = (
        CheckConstraint(f"source_type IN ({enum_values(ImportSourceType)})", name="source_type_valid"),
        CheckConstraint(f"status IN ({enum_values(ImportStatus)})", name="status_valid"),
        Index("ix_menu_imports_restaurant_hash", "restaurant_id", "file_sha256"),
    )

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("restaurants.id", ondelete="CASCADE"), index=True
    )
    source_type: Mapped[str] = mapped_column(String(10))
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_path: Mapped[str] = mapped_column(String(500))
    file_sha256: Mapped[str] = mapped_column(String(64))
    file_size: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default=ImportStatus.PROCESSING)
    extraction_result: Mapped[dict | None] = mapped_column(JSONB)
    warnings: Mapped[list] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    error_message: Mapped[str | None] = mapped_column(Text)
    uploaded_by_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    approved_at: Mapped[datetime | None]
    approval_mode: Mapped[str | None] = mapped_column(String(10))
    stats: Mapped[dict | None] = mapped_column(JSONB)
