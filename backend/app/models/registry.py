import threading

_lock = threading.Lock()
_models: dict = {}


def get_model(name: str):
    """
    Lazy-load and cache models.
    Models are only loaded on first request, then reused.
    Thread-safe.
    """
    if name not in _models:
        with _lock:
            if name not in _models:
                _models[name] = _load(name)
    return _models[name]


def _load(name: str):
    if name == "rembg":
        from rembg import new_session
        print(f"[registry] Loading model: {name}")
        return new_session("u2net")

    # Future models — uncomment when ready:
    # if name == "eye_contact":
    #     from app.models.eye_contact_model import EyeContactModel
    #     return EyeContactModel.load("ml_models/eye_contact/weights.onnx")

    raise ValueError(f"[registry] Unknown model: {name}")


def preload_models(names: list):
    """
    Call on startup to warm up models before first request.
    Avoids slow first request.
    """
    for name in names:
        print(f"[registry] Preloading: {name}")
        get_model(name)