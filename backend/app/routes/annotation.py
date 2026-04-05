from __future__ import annotations

import csv
import json
import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ── Optional MediaPipe ────────────────────────────────────────────────────────
try:
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision
    _MP_OK = True
except ImportError:
    _MP_OK = False

router = APIRouter()

# ── Paths ─────────────────────────────────────────────────────────────────────
_HERE      = Path(__file__).resolve().parent          # backend/app/routes/
_APP       = _HERE.parent                             # backend/app/
_BACKEND   = _APP.parent                              # backend/
_ROOT      = _BACKEND.parent                          # video-studio/  ← root

DATA_DIR   = _BACKEND / "data"
RAW_DIR    = DATA_DIR / "raw_captures"
ANN_DIR    = DATA_DIR / "annotated"
TRAIN_DIR  = DATA_DIR / "training_pairs"

# ml_models is at ROOT level, not inside backend
LMRK_PATH  = _ROOT / "ml_models" / "eye_contact" / "face_landmarker.task"

# ── MediaPipe landmark indices ────────────────────────────────────────────────
_L_UPPER = [246, 161, 160, 159, 158, 157, 173]
_L_LOWER = [33,  7,  163, 144, 145, 153, 154, 155, 133]
_R_UPPER = [466, 388, 387, 386, 385, 384, 398]
_R_LOWER = [263, 249, 390, 373, 374, 380, 381, 382, 362]
_L_IRIS  = [474, 475, 476, 477]
_R_IRIS  = [469, 470, 471, 472]


# ── Pydantic models ───────────────────────────────────────────────────────────

class Pt(BaseModel):
    x: float
    y: float

class Eyelids(BaseModel):
    upper: List[Pt]
    lower: List[Pt]

class EyeAnn(BaseModel):
    center:       Pt
    corners:      Dict[str, Pt]
    eyelids:      Eyelids
    iris_center:  Pt
    iris_radius:  float
    pupil_center: Pt
    pupil_radius: float
    openness:     float

class GazeAnn(BaseModel):
    direction:       str
    is_target_frame: bool
    target:          Dict[str, Any]

class FrameAnn(BaseModel):
    frame_id:           str
    image_path:         str
    image_dimensions:   Optional[Dict[str, int]] = None
    gaze:               GazeAnn
    left_eye:           EyeAnn
    right_eye:          EyeAnn
    head_pose:          Optional[Dict[str, float]] = None
    manually_corrected: List[str] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_px(lm, w: int, h: int) -> dict:
    return {"x": float(lm.x * w), "y": float(lm.y * h)}

def _center(pts: list) -> dict:
    return {
        "x": float(np.mean([p["x"] for p in pts])),
        "y": float(np.mean([p["y"] for p in pts])),
    }

def _openness(upper: list, lower: list) -> float:
    uy = np.mean([p["y"] for p in upper])
    ly = np.mean([p["y"] for p in lower])
    w  = abs(upper[-1]["x"] - upper[0]["x"]) + 1e-6
    return float(abs(ly - uy) / w)

def _eye_block(lms, upper_idx, lower_idx, iris_idx, w, h) -> dict:
    upper = [_to_px(lms[i], w, h) for i in upper_idx]
    lower = [_to_px(lms[i], w, h) for i in lower_idx]
    iris  = [_to_px(lms[i], w, h) for i in iris_idx]
    all_p = upper + lower
    ic    = _center(iris)
    ir    = float(np.mean([
        np.hypot(p["x"] - ic["x"], p["y"] - ic["y"]) for p in iris
    ]))
    return {
        "center":  _center(all_p),
        "corners": {
            "inner": min(all_p, key=lambda p: p["x"]),
            "outer": max(all_p, key=lambda p: p["x"]),
        },
        "eyelids":      {"upper": upper, "lower": lower},
        "iris_center":  ic,
        "iris_radius":  ir,
        "pupil_center": ic,
        "pupil_radius": ir * 0.5,
        "openness":     _openness(upper, lower),
    }

def _run_mediapipe(img_bgr: np.ndarray):
    if not _MP_OK or not LMRK_PATH.exists():
        return None
    base = mp_python.BaseOptions(model_asset_path=str(LMRK_PATH))
    opts = mp_vision.FaceLandmarkerOptions(base_options=base, num_faces=1)
    det  = mp_vision.FaceLandmarker.create_from_options(opts)
    mpi  = mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB),
    )
    res = det.detect(mpi)
    return res.face_landmarks[0] if res.face_landmarks else None

def _find_image(session_id: str, frame_id: str) -> Optional[Path]:
    base = RAW_DIR / session_id
    for ext in (".jpg", ".jpeg", ".png", ".JPG"):
        p = base / f"{frame_id}{ext}"
        if p.exists():
            return p
    return None

def _read_manifest(session_id: str) -> dict:
    """
    Returns dict keyed by frame_id with manifest row data.
    Falls back to empty dict if no manifest exists.
    """
    csv_path = RAW_DIR / session_id / "manifest.csv"
    if not csv_path.exists():
        return {}
    result = {}
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            result[row["frame_id"]] = row
    return result


# ── CSV export helper ─────────────────────────────────────────────────────────

CSV_COLUMNS = [
    # Identity
    "session_id", "frame_id", "filename",
    # Gaze
    "gaze_direction", "is_target_frame",
    # Image size
    "img_width", "img_height",
    # Left eye
    "l_iris_x", "l_iris_y", "l_iris_radius",
    "l_pupil_x", "l_pupil_y", "l_pupil_radius",
    "l_inner_corner_x", "l_inner_corner_y",
    "l_outer_corner_x", "l_outer_corner_y",
    "l_openness",
    "l_upper_eyelid",   # JSON string of point list
    "l_lower_eyelid",
    # Right eye
    "r_iris_x", "r_iris_y", "r_iris_radius",
    "r_pupil_x", "r_pupil_y", "r_pupil_radius",
    "r_inner_corner_x", "r_inner_corner_y",
    "r_outer_corner_x", "r_outer_corner_y",
    "r_openness",
    "r_upper_eyelid",
    "r_lower_eyelid",
    # Head pose
    "head_yaw", "head_pitch", "head_roll",
    # Meta
    "annotated_at", "manually_corrected",
]

def _ann_to_csv_row(session_id: str, ann: dict) -> dict:
    le = ann.get("left_eye",  {})
    re = ann.get("right_eye", {})
    hp = ann.get("head_pose", {}) or {}
    dims = ann.get("image_dimensions", {}) or {}

    def ic(eye): return eye.get("iris_center",  {})
    def pc(eye): return eye.get("pupil_center", {})
    def co(eye): return eye.get("corners",      {})

    return {
        "session_id":        session_id,
        "frame_id":          ann["frame_id"],
        "filename":          ann["frame_id"] + ".jpg",
        "gaze_direction":    ann["gaze"]["direction"],
        "is_target_frame":   ann["gaze"]["is_target_frame"],
        "img_width":         dims.get("width",  ""),
        "img_height":        dims.get("height", ""),
        # Left eye
        "l_iris_x":          ic(le).get("x", ""),
        "l_iris_y":          ic(le).get("y", ""),
        "l_iris_radius":     le.get("iris_radius", ""),
        "l_pupil_x":         pc(le).get("x", ""),
        "l_pupil_y":         pc(le).get("y", ""),
        "l_pupil_radius":    le.get("pupil_radius", ""),
        "l_inner_corner_x":  co(le).get("inner", {}).get("x", ""),
        "l_inner_corner_y":  co(le).get("inner", {}).get("y", ""),
        "l_outer_corner_x":  co(le).get("outer", {}).get("x", ""),
        "l_outer_corner_y":  co(le).get("outer", {}).get("y", ""),
        "l_openness":        le.get("openness", ""),
        "l_upper_eyelid":    json.dumps(le.get("eyelids", {}).get("upper", [])),
        "l_lower_eyelid":    json.dumps(le.get("eyelids", {}).get("lower", [])),
        # Right eye
        "r_iris_x":          ic(re).get("x", ""),
        "r_iris_y":          ic(re).get("y", ""),
        "r_iris_radius":     re.get("iris_radius", ""),
        "r_pupil_x":         pc(re).get("x", ""),
        "r_pupil_y":         pc(re).get("y", ""),
        "r_pupil_radius":    re.get("pupil_radius", ""),
        "r_inner_corner_x":  co(re).get("inner", {}).get("x", ""),
        "r_inner_corner_y":  co(re).get("inner", {}).get("y", ""),
        "r_outer_corner_x":  co(re).get("outer", {}).get("x", ""),
        "r_outer_corner_y":  co(re).get("outer", {}).get("y", ""),
        "r_openness":        re.get("openness", ""),
        "r_upper_eyelid":    json.dumps(re.get("eyelids", {}).get("upper", [])),
        "r_lower_eyelid":    json.dumps(re.get("eyelids", {}).get("lower", [])),
        # Head pose
        "head_yaw":          hp.get("yaw",   ""),
        "head_pitch":        hp.get("pitch", ""),
        "head_roll":         hp.get("roll",  ""),
        # Meta
        "annotated_at":      ann.get("annotation_meta", {}).get("annotated_at", ""),
        "manually_corrected": "|".join(ann.get("manually_corrected", [])),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/annotation/sessions")
def list_sessions():
    """List all recorded sessions."""
    if not RAW_DIR.exists():
        return []
    out = []
    for name in sorted(os.listdir(RAW_DIR)):
        path = RAW_DIR / name
        if not path.is_dir():
            continue
        frames = [
            f for f in os.listdir(path)
            if f.lower().endswith((".jpg", ".jpeg", ".png"))
        ]
        ann_path  = ANN_DIR / name
        annotated = (
            len([f for f in os.listdir(ann_path) if f.endswith(".json")])
            if ann_path.exists() else 0
        )
        # Read manifest for gaze label breakdown
        manifest  = _read_manifest(name)
        label_counts: dict = {}
        for row in manifest.values():
            lbl = row.get("label", "unknown")
            label_counts[lbl] = label_counts.get(lbl, 0) + 1

        out.append({
            "session_id":       name,
            "total_frames":     len(frames),
            "annotated_frames": annotated,
            "label_counts":     label_counts,
            "created_at":       datetime.fromtimestamp(
                path.stat().st_ctime
            ).isoformat(),
        })
    return out


@router.get("/annotation/sessions/{session_id}/frames")
def list_frames(session_id: str):
    """List all frames in a session with annotation status."""
    sess_dir = RAW_DIR / session_id
    if not sess_dir.exists():
        raise HTTPException(404, f"Session '{session_id}' not found")

    ann_dir  = ANN_DIR / session_id
    manifest = _read_manifest(session_id)
    result   = []

    for fname in sorted(os.listdir(sess_dir)):
        if not fname.lower().endswith((".jpg", ".jpeg", ".png")):
            continue
        fid      = fname.rsplit(".", 1)[0]
        ann_file = ann_dir / f"{fid}.json"
        mrow     = manifest.get(fid, {})
        result.append({
            "frame_id":        fid,
            "filename":        fname,
            "annotated":       ann_file.exists(),
            "label":           mrow.get("label", "unknown"),
            "gaze_direction":  mrow.get("gaze_direction", "unknown"),
            "is_target_frame": mrow.get("is_target_frame", "false") == "true",
            "image_url": (
                f"/api/v1/annotation/sessions/{session_id}/image/{fname}"
            ),
        })
    return result


@router.get("/annotation/sessions/{session_id}/image/{filename}")
def serve_image(session_id: str, filename: str):
    path = RAW_DIR / session_id / filename
    if not path.exists():
        raise HTTPException(404, "Image not found")
    return FileResponse(str(path))


@router.get("/annotation/sessions/{session_id}/autodetect/{frame_id}")
def auto_detect(session_id: str, frame_id: str):
    """Run MediaPipe on a frame and return pre-filled landmark data."""
    img_path = _find_image(session_id, frame_id)
    if not img_path:
        raise HTTPException(404, f"Frame not found: {frame_id}")

    img = cv2.imread(str(img_path))
    if img is None:
        raise HTTPException(500, "Could not read image")

    h, w = img.shape[:2]
    lms  = _run_mediapipe(img)

    if lms is None:
        return {
            "auto_detected":    False,
            "message":          "No face detected",
            "image_dimensions": {"width": w, "height": h},
        }

    # Also read manifest row so we can pre-fill gaze direction
    manifest = _read_manifest(session_id)
    mrow     = manifest.get(frame_id, {})

    return {
        "auto_detected":    True,
        "image_dimensions": {"width": w, "height": h},
        "left_eye":  _eye_block(lms, _L_UPPER, _L_LOWER, _L_IRIS, w, h),
        "right_eye": _eye_block(lms, _R_UPPER, _R_LOWER, _R_IRIS, w, h),
        "head_pose": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0},
        # Pre-fill gaze from manifest so user doesn't have to click it
        "suggested_gaze": {
            "direction":       mrow.get("gaze_direction", "unknown"),
            "is_target_frame": mrow.get("is_target_frame", "false") == "true",
        },
    }


@router.get("/annotation/sessions/{session_id}/annotation/{frame_id}")
def load_annotation(session_id: str, frame_id: str):
    path = ANN_DIR / session_id / f"{frame_id}.json"
    if not path.exists():
        raise HTTPException(404, "No annotation saved yet")
    with open(path) as f:
        return json.load(f)


@router.post("/annotation/sessions/{session_id}/annotate/{frame_id}")
def save_annotation(session_id: str, frame_id: str, body: FrameAnn):
    """Save annotation JSON and update the session CSV."""
    ann_session_dir = ANN_DIR / session_id
    ann_session_dir.mkdir(parents=True, exist_ok=True)

    # Save JSON
    data = body.dict()
    data["annotation_meta"] = {
        "annotated_by":       "neelkant",
        "annotated_at":       datetime.now().isoformat(),
        "annotation_version": "1.0",
        "manually_corrected": body.manually_corrected,
    }
    json_path = ann_session_dir / f"{frame_id}.json"
    with open(json_path, "w") as f:
        json.dump(data, f, indent=2)

    # ── Update session CSV ────────────────────────────────────────────────────
    _rebuild_session_csv(session_id)

    return {"status": "saved", "path": str(json_path)}


def _rebuild_session_csv(session_id: str):
    """
    Rebuild the full annotation CSV for a session.
    Called after every save so the CSV is always up to date.

    Output: data/annotated/{session_id}/annotations.csv
    """
    ann_dir = ANN_DIR / session_id
    if not ann_dir.exists():
        return

    rows = []
    for fname in sorted(os.listdir(ann_dir)):
        if not fname.endswith(".json"):
            continue
        with open(ann_dir / fname) as f:
            ann = json.load(f)
        rows.append(_ann_to_csv_row(session_id, ann))

    csv_path = ann_dir / "annotations.csv"
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)

    print(f"[annotation] CSV updated → {csv_path} ({len(rows)} rows)")


@router.post("/annotation/sessions/{session_id}/export-training")
def export_training(session_id: str):
    """
    Copy annotated frames into training_pairs/inputs/ and targets/.
    Also writes a master training CSV combining all sessions.
    """
    ann_dir = ANN_DIR / session_id
    if not ann_dir.exists():
        raise HTTPException(404, "No annotations for this session")

    inputs_dir  = TRAIN_DIR / "inputs"
    targets_dir = TRAIN_DIR / "targets"
    inputs_dir.mkdir(parents=True,  exist_ok=True)
    targets_dir.mkdir(parents=True, exist_ok=True)

    stats = {"inputs": 0, "targets": 0, "skipped": 0}
    rows  = []

    for fname in sorted(os.listdir(ann_dir)):
        if not fname.endswith(".json"):
            continue
        with open(ann_dir / fname) as f:
            ann = json.load(f)

        src = _find_image(session_id, ann["frame_id"])
        if not src:
            stats["skipped"] += 1
            continue

        is_target = ann["gaze"]["is_target_frame"]
        dest_dir  = targets_dir if is_target else inputs_dir
        key       = f"{session_id}_{ann['frame_id']}"

        shutil.copy2(src, dest_dir / f"{key}.jpg")

        # Save annotation JSON alongside image
        with open(dest_dir / f"{key}.json", "w") as f:
            json.dump(ann, f, indent=2)

        rows.append(_ann_to_csv_row(session_id, ann))

        if is_target:
            stats["targets"] += 1
        else:
            stats["inputs"] += 1

    # ── Write / append master training CSV ───────────────────────────────────
    master_csv = TRAIN_DIR / "training_data.csv"
    write_header = not master_csv.exists()
    with open(master_csv, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_COLUMNS)
        if write_header:
            writer.writeheader()
        writer.writerows(rows)

    print(f"[annotation] Export done → {stats}")
    print(f"[annotation] Master CSV  → {master_csv}")

    return {
        **stats,
        "session_id":  session_id,
        "master_csv":  str(master_csv),
    }


@router.get("/annotation/stats")
def dataset_stats():
    """Overall dataset summary."""
    stats = {
        "total_sessions":    0,
        "total_annotated":   0,
        "training_inputs":   0,
        "training_targets":  0,
        "gaze_distribution": {},
    }

    if ANN_DIR.exists():
        for session in os.listdir(ANN_DIR):
            sdir = ANN_DIR / session
            if not sdir.is_dir():
                continue
            stats["total_sessions"] += 1
            for fname in os.listdir(sdir):
                if not fname.endswith(".json"):
                    continue
                stats["total_annotated"] += 1
                with open(sdir / fname) as f:
                    ann = json.load(f)
                d = ann.get("gaze", {}).get("direction", "unknown")
                stats["gaze_distribution"][d] = (
                    stats["gaze_distribution"].get(d, 0) + 1
                )

    for split in ("inputs", "targets"):
        d = TRAIN_DIR / split
        if d.exists():
            stats[f"training_{split}"] = len([
                f for f in os.listdir(d) if f.endswith(".jpg")
            ])

    return stats