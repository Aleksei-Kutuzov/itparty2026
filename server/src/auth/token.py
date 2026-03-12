from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from src.core import config, get_logger
from src.db.users.schemas import TokenPayload

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    password_bytes = password.encode("utf-8")
    truncated_password = password_bytes[:72]
    safe_password = truncated_password.decode("utf-8", errors="ignore")
    return pwd_context.hash(safe_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, config.secret_key, algorithm=config.algorithm)


def decode_token(token: str) -> TokenPayload | None:
    try:
        payload = jwt.decode(token, config.secret_key, algorithms=[config.algorithm])
        payload["sub"] = int(payload["sub"])
        return TokenPayload(**payload)
    except (JWTError, ValueError, TypeError) as error:
        get_logger(__name__).warning("Не удалось декодировать JWT токен: %s", str(error))
        return None

