from fastapi import APIRouter, Depends, File, Query, Request, UploadFile, status
from pydantic import BaseModel

from app.api.deps import require_admin
from app.core.config import get_settings
from app.core.ratelimit import limiter
from app.models import User
from app.services import upload_service

router = APIRouter(prefix="/uploads", tags=["uploads"])


class UploadedImage(BaseModel):
    url: str


@router.post("/images", response_model=UploadedImage, status_code=status.HTTP_201_CREATED)
@limiter.limit("60/minute")
async def upload_image(
    request: Request,  # required by the rate limiter
    file: UploadFile = File(...),
    kind: str = Query("images", pattern="^(images|restaurants|items)$"),
    _: User = Depends(require_admin),
):
    data = await upload_service.read_limited(file, get_settings().max_image_upload_mb)
    return UploadedImage(url=upload_service.save_image(data, kind))
