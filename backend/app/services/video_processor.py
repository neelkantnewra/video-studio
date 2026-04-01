import cv2
import numpy as np
import subprocess
from pathlib import Path
from typing import Callable, Optional


FrameFn = Callable[[np.ndarray], np.ndarray]


def process_video(
    input_path: Path,
    output_path: Path,
    frame_fn: FrameFn,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> Path:
    cap = cv2.VideoCapture(str(input_path))

    if not cap.isOpened():
        raise ValueError(f"[video_processor] Could not open video: {input_path}")

    # Read video properties
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Fix FPS drift — round to nearest standard fps
    fps = _normalize_fps(fps)

    print(f"[video_processor] Input: {input_path.name}")
    print(f"[video_processor] Resolution: {width}x{height} @ {fps}fps")
    print(f"[video_processor] Total frames: {total_frames}")

    # Write to a temp file first, then mux audio separately
    temp_output = output_path.parent / f"temp_novideo_{output_path.name}"

    fourcc = cv2.VideoWriter_fourcc(*"avc1")
    writer = cv2.VideoWriter(str(temp_output), fourcc, fps, (width, height))

    if not writer.isOpened():
        cap.release()
        raise ValueError(f"[video_processor] Could not create output: {output_path}")

    frame_idx = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            processed_frame = frame_fn(frame)
            writer.write(processed_frame)

            frame_idx += 1

            if progress_callback:
                progress_callback(frame_idx, total_frames)

            if frame_idx % 50 == 0:
                pct = round((frame_idx / total_frames) * 100)
                print(f"[video_processor] Progress: {frame_idx}/{total_frames} ({pct}%)")

    finally:
        cap.release()
        writer.release()

    # Mux original audio back into processed video
    print(f"[video_processor] Muxing audio...")
    _mux_audio(input_path, temp_output, output_path)

    # Clean up temp file
    if temp_output.exists():
        temp_output.unlink()

    print(f"[video_processor] Done → {output_path.name}")
    return output_path


def _normalize_fps(fps: float) -> float:
    """
    Round to nearest standard FPS to avoid duration drift.
    29.34 → 29.97, 23.97 → 24, etc.
    """
    standard = [23.976, 24.0, 25.0, 29.97, 30.0, 48.0, 50.0, 59.94, 60.0]
    return min(standard, key=lambda x: abs(x - fps))


def _mux_audio(original: Path, video_only: Path, output: Path):
    """
    Use ffmpeg to copy original audio track into the processed video.
    -c:v copy  — don't re-encode video
    -c:a copy  — don't re-encode audio
    -shortest  — match duration to shortest stream (fixes length drift)
    """
    cmd = [
        "ffmpeg",
        "-y",                        # overwrite output
        "-i", str(video_only),       # processed video (no audio)
        "-i", str(original),         # original video (has audio)
        "-c:v", "copy",              # copy video as-is
        "-c:a", "aac",               # encode audio as aac
        "-map", "0:v:0",             # video from first input
        "-map", "1:a:0",             # audio from second input
        "-shortest",                 # match shortest stream
        str(output)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"[video_processor] ffmpeg error: {result.stderr}")
        # fallback — just rename video-only file if ffmpeg fails
        video_only.rename(output)
    else:
        print(f"[video_processor] Audio muxed successfully")