import cv2
import numpy as np
from pathlib import Path
from typing import Callable, Optional
from PIL import Image
from rembg import remove
from app.models.registry import get_model
from app.services.video_processor import process_video


def hex_to_rgba(hex_color: str) -> tuple:
    """Convert #RRGGBB to (R, G, B, 255)"""
    hex_color = hex_color.lstrip('#')
    r = int(hex_color[0:2], 16)
    g = int(hex_color[2:4], 16)
    b = int(hex_color[4:6], 16)
    return (r, g, b, 255)


def remove_background_from_video(
    input_path: Path,
    output_path: Path,
    progress_callback: Optional[Callable[[int, int], None]] = None,
    bg_color: str = "#FFFFFF",
) -> Path:
    print(f"[bg_removal] Starting background removal with bg_color={bg_color}")

    session = get_model("rembg")
    rgba = hex_to_rgba(bg_color)

    def frame_fn(frame: np.ndarray) -> np.ndarray:
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(rgb)

        result: Image.Image = remove(pil_img, session=session)

        # Use the color from frontend instead of hardcoded white
        background = Image.new("RGBA", result.size, rgba)
        background.paste(result, mask=result.split()[3])

        final = cv2.cvtColor(
            np.array(background.convert("RGB")),
            cv2.COLOR_RGB2BGR
        )
        return final

    return process_video(input_path, output_path, frame_fn, progress_callback)