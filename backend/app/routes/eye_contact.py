from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
from typing import List
from pathlib import Path
import shutil

router = APIRouter()

FRAMES_DIR = Path("tests/samples/frames")

@router.get("/status")
def status():
    model = Path("ml_models/eye_contact/gaze_personal.onnx")
    return { "trained": model.exists() }

@router.post("/save-samples")
async def save_samples(
    frames: List[UploadFile] = File(...),
    labels: List[str]        = Form(...),
):
    saved = { "at_camera": 0, "slightly_off": 0, "looking_away": 0 }

    for frame, label in zip(frames, labels):
        out_dir = FRAMES_DIR / label
        out_dir.mkdir(parents=True, exist_ok=True)

        # Count existing to avoid overwriting
        existing = len(list(out_dir.glob("*.jpg")))
        out_path = out_dir / f"{label}_{existing:06d}.jpg"

        contents = await frame.read()
        out_path.write_bytes(contents)
        saved[label] = saved.get(label, 0) + 1

    total = sum(saved.values())
    print(f"[eye-contact] Saved {total} frames → {FRAMES_DIR}")
    return { "saved": saved, "total": total }