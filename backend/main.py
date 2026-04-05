from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import bg_removal
from app.routes import eye_contact
from app.routes import annotation          
from app.models.registry import preload_models


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[main] Starting Video Studio API...")
    print(f"[main] Enabled features: {settings.enabled_features}")

    # Preload ML models
    if settings.FEATURE_BG_REMOVAL:
        preload_models(["rembg"])

    # Ensure data folders exist
    root = os.path.dirname(os.path.abspath(__file__))
    for folder in [
        os.path.join(root, "data", "raw_captures"),
        os.path.join(root, "data", "annotated"),
        os.path.join(root, "data", "training_pairs", "inputs"),
        os.path.join(root, "data", "training_pairs", "targets"),
    ]:
        os.makedirs(folder, exist_ok=True)

    print("[main] Ready!")
    yield
    print("[main] Shutting down...")


app = FastAPI(
    title="Video Studio API",
    description="Local AI-powered video processing",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
if settings.FEATURE_BG_REMOVAL:
    app.include_router(
        bg_removal.router,
        prefix="/api/v1/bg-removal",
        tags=["background-removal"],
    )

if settings.FEATURE_EYE_CONTACT:
    app.include_router(
        eye_contact.router,
        prefix="/api/v1/eye-contact",
        tags=["eye-contact"],
    )

# Annotation is always available — it's a dev/data tool
app.include_router(
    annotation.router,
    prefix="/api/v1",
    tags=["annotation"],
)


@app.get("/health")
async def health():
    return {
        "status":   "ok",
        "version":  "0.1.0",
        "features": settings.enabled_features,
    }