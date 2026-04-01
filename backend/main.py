from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.routes import bg_removal
from app.models.registry import preload_models


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("[main] Starting Video Studio API...")
    print(f"[main] Enabled features: {settings.enabled_features}")
    if settings.FEATURE_BG_REMOVAL:
        preload_models(["rembg"])
    print("[main] Ready!")
    
    yield  # App runs here
    
    # Shutdown (add cleanup here later if needed)
    print("[main] Shutting down...")


app = FastAPI(
    title="Video Studio API",
    description="Local AI-powered video processing",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routes based on feature flags
if settings.FEATURE_BG_REMOVAL:
    app.include_router(
        bg_removal.router,
        prefix="/api/v1/bg-removal",
        tags=["background-removal"]
    )

# Future:
# if settings.FEATURE_EYE_CONTACT:
#     from app.routes import eye_contact
#     app.include_router(
#         eye_contact.router,
#         prefix="/api/v1/eye-contact",
#         tags=["eye-contact"]
#     )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "features": settings.enabled_features,
    }