from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.database import get_db

router = APIRouter()


@router.get("/")
def root() -> dict[str, str]:
    return {"message": "HackYeah API"}


@router.get("/db-check")
def db_check(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"database": "connected"}
