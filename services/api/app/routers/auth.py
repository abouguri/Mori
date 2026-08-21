import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.deps import get_current_user
from app.models.user import User
from app.schemas.user import LoginRequest, RegisterRequest, UserRead
from app.services.security import TokenType, create_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


# Browsers silently drop `SameSite=None` cookies lacking `Secure` — deriving
# it here means a config that sets samesite="none" but forgets cookie_secure
# fails loudly (login just won't stick) rather than working locally and
# breaking only once deployed cross-site.
_COOKIE_SECURE = settings.cookie_secure or settings.cookie_samesite == "none"


def _set_session_cookies(response: Response, user_id: uuid.UUID) -> None:
    access_token = create_token(user_id, TokenType.ACCESS)
    refresh_token = create_token(user_id, TokenType.REFRESH)
    response.set_cookie(
        "access_token",
        access_token,
        max_age=settings.access_token_ttl_minutes * 60,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite=settings.cookie_samesite,
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=_COOKIE_SECURE,
        samesite=settings.cookie_samesite,
    )


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)) -> User:
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists") from exc
    await db.refresh(user)

    _set_session_cookies(response, user.id)
    return user


@router.post("/login", response_model=UserRead)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> User:
    user = await db.scalar(select(User).where(User.email == body.email))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")

    _set_session_cookies(response, user.id)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    # Must match the attributes the cookie was set with, or some browsers
    # (notably Safari) treat this as a different cookie and don't clear it.
    response.delete_cookie(
        "access_token", secure=_COOKIE_SECURE, samesite=settings.cookie_samesite
    )
    response.delete_cookie(
        "refresh_token", secure=_COOKIE_SECURE, samesite=settings.cookie_samesite
    )


@router.get("/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> User:
    return user
