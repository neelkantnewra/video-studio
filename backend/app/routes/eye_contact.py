from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse
from typing import List
from pathlib import Path
from datetime import datetime
import shutil
import csv
import os

router = APIRouter()

# ── Paths ─────────────────────────────────────────────────────────────────────
_HERE      = Path(__file__).resolve().parent   # backend/app/routes/
_APP       = _HERE.parent                       # backend/app/
_BACKEND   = _APP.parent                        # backend/
_ROOT      = _BACKEND.parent                    # video-studio/

BASE_DIR   = _BACKEND                           # data goes inside backend
RAW_DIR    = BASE_DIR / "data" / "raw_captures"
ANN_DIR    = BASE_DIR / "data" / "annotated"
TRAIN_DIR  = BASE_DIR / "data" / "training_pairs"


def _new_session_id() -> str:
    """e.g.  session_20250115_143022"""
    return f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"


@router.get("/status")
def status():
    model = BASE_DIR / "ml_models" / "eye_contact" / "gaze_personal.onnx"
    return {"trained": model.exists()}


@router.post("/save-samples")
async def save_samples(
    frames: List[UploadFile] = File(...),
    labels: List[str]        = Form(...),
):
    """
    Save captured frames into:
        data/raw_captures/{session_id}/{label}_{index:06d}.jpg

    Also write a manifest CSV:
        data/raw_captures/{session_id}/manifest.csv
        columns: frame_id, filename, label, gaze_direction, is_target_frame
    """
    session_id  = _new_session_id()
    session_dir = RAW_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    saved   = {"at_camera": 0, "slightly_off": 0, "looking_away": 0}
    records = []   # for the manifest CSV

    for frame, label in zip(frames, labels):
        # Normalise label just in case frontend sends something unexpected
        label = label.strip()
        if label not in saved:
            saved[label] = 0

        index    = saved[label]
        filename = f"{label}_{index:06d}.jpg"
        out_path = session_dir / filename

        contents = await frame.read()
        out_path.write_bytes(contents)

        records.append({
            "frame_id":        filename.replace(".jpg", ""),
            "filename":        filename,
            "label":           label,
            # is_target_frame = True only for at_camera frames
            "is_target_frame": "true" if label == "at_camera" else "false",
            "gaze_direction":  "camera" if label == "at_camera" else label,
            "session_id":      session_id,
        })

        saved[label] += 1

    total = sum(saved.values())

    # ── Write manifest CSV ────────────────────────────────────────────────────
    csv_path = session_dir / "manifest.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "frame_id", "filename", "label",
            "gaze_direction", "is_target_frame", "session_id",
        ])
        writer.writeheader()
        writer.writerows(records)

    print(f"[eye-contact] Session {session_id}: saved {total} frames")
    print(f"[eye-contact] Manifest → {csv_path}")

    return {
        "session_id": session_id,
        "saved":      saved,
        "total":      total,
        "path":       str(session_dir),
    }