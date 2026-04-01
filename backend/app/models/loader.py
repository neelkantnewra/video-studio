from pathlib import Path
from app.config import settings


def get_model_path(feature: str, filename: str) -> Path:
    """
    Returns the full path to a model weight file.
    Used for custom trained models (eye contact, etc.)
    
    Example:
        get_model_path("eye_contact", "weights.onnx")
        → ml_models/eye_contact/weights.onnx
    """
    path = settings.MODELS_DIR / feature / filename

    if not path.exists():
        raise FileNotFoundError(
            f"\n[loader] Model weights not found at: {path}\n"
            f"→ See ml_models/README.md for download instructions.\n"
            f"→ Or run the Kaggle notebook to train your own.\n"
        )

    return path