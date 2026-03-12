from src.api.admin import *
from src.api.auth import *
from src.api.edu import *
from src.api.me import *
from src.api.root import *
from src.core import config

__all__ = ["api_router", "health_check"]


def include_routers(app):
    app.include_router(api_router, prefix=config.api_v1_prefix)
    app.include_router(api_auth_router, prefix=config.api_v1_prefix)
    app.include_router(api_me_router, prefix=config.api_v1_prefix)
    app.include_router(api_admin_router, prefix=config.api_v1_prefix)
    app.include_router(api_edu_router, prefix=config.api_v1_prefix)

