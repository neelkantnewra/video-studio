import cv2
import numpy as np
from pathlib import Path
from typing import Callable, Optional
from PIL import Image
from rembg import remove
from app.models.registry import get_model
from app.services.video_processor import process_video


def remove_background_from_video(
    input_path: Path,
    output_path: Path,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> Path:
    """
    Background removal service.

    Uses rembg with U2Net model.
    Runs on CPU — no GPU needed.

    Flow:
        1. Load U2Net model from registry (cached after first load)
        2. For each frame: BGR → PIL → rembg → white bg composite → BGR
        3. Write processed frame to output video
    """
    print("[bg_removal] Starting background removal...")
    
    # Get cached model — loads once, reused for all frames
    session = get_model("rembg")

    def frame_fn(frame: np.ndarray) -> np.ndarray:
        # OpenCV gives BGR — convert to RGB for PIL
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(rgb)

        # Remove background — returns RGBA image
        result: Image.Image = remove(pil_img, session=session)

        # Composite onto white background
        # (pure transparency looks bad in video, white is cleanest)
        background = Image.new("RGBA", result.size, (255, 255, 255, 255))
        background.paste(result, mask=result.split()[3])

        # Convert back to BGR for OpenCV writer
        final = cv2.cvtColor(
            np.array(background.convert("RGB")),
            cv2.COLOR_RGB2BGR
        )
        return final

    return process_video(input_path, output_path, frame_fn, progress_callback)