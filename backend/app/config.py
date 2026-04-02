from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings

# Absolute path to project root (2 levels up from this file)
BASE_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    # Server
    BACKEND_HOST: str = "0.0.0.0"
    BACKEND_PORT: int = 8000
    ALLOWED_ORIGINS: List[str] = ["*"]

    # Paths — all absolute, works regardless of where you run from
    UPLOAD_DIR: Path = BASE_DIR / "temp" / "uploads"
    PROCESSED_DIR: Path = BASE_DIR / "temp" / "processed"
    OUTPUT_DIR: Path = BASE_DIR / "temp" / "outputs"
    MODELS_DIR: Path = BASE_DIR / "ml_models"

    # Feature flags
    FEATURE_BG_REMOVAL: bool = True
    FEATURE_EYE_CONTACT: bool = True

    # Processing
    MAX_VIDEO_SIZE_MB: int = 500
    FRAME_BATCH_SIZE: int = 8

    class Config:
        env_file = ".env"

    @property
    def enabled_features(self) -> List[str]:
        features = []
        if self.FEATURE_BG_REMOVAL:
            features.append("bg_removal")
        if self.FEATURE_EYE_CONTACT:
            features.append("eye_contact")
        return features

    def ensure_dirs(self):
        for d in [self.UPLOAD_DIR, self.PROCESSED_DIR, self.OUTPUT_DIR]:
            d.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_dirs()