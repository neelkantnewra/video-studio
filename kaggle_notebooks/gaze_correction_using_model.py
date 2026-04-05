import os
import cv2
import requests
import numpy as np
import tensorflow as tf
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from tensorflow.keras import layers, models

# --- 1. DYNAMIC PATH CONFIGURATION ---
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.join(current_dir, "..")

MODEL_FOLDER = os.path.join(root_dir, "ml_models", "eye_contact")
LANDMARKER_PATH = os.path.join(MODEL_FOLDER, "face_landmarker.task")
# USE THE WEIGHTS FILE INSTEAD OF THE .KERAS FILE
GAZE_WEIGHTS_PATH = os.path.join(MODEL_FOLDER, "eye_gaze_weights_best.weights.h5")

INPUT_IMAGE = "/Users/neelkantnewra/Desktop/video-studio/kaggle_notebooks/test2.jpg"
OUTPUT_IMAGE = "/Users/neelkantnewra/Desktop/video-studio/kaggle_notebooks/test_corrected.jpg"

# --- 2. AUTO-DOWNLOAD MEDIAPIPE TASK ---
def ensure_landmarker():
    if not os.path.exists(MODEL_FOLDER):
        os.makedirs(MODEL_FOLDER)
    if not os.path.exists(LANDMARKER_PATH):
        url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
        print(f"⏳ Downloading MediaPipe model to {LANDMARKER_PATH}...")
        response = requests.get(url, stream=True)
        with open(LANDMARKER_PATH, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print("🚀 Download complete!")

# --- 3. ARCHITECTURE BUILDER (Bypasses Keras Version Errors) ---
import tensorflow as tf
from tensorflow.keras import layers, models

def residual_block(x, filters):
    shortcut = x
    # Layer 1
    x = layers.Conv2D(filters, 3, padding='same', activation='relu')(x)
    # Layer 2
    x = layers.Conv2D(filters, 3, padding='same')(x)
    # Merge
    x = layers.Add()([x, shortcut])
    return layers.Activation('relu')(x)

def build_pro_unet(input_shape=(64, 160, 3)):
    inputs = layers.Input(shape=input_shape)
    
    # --- ENCODER ---
    e1 = layers.Conv2D(64, 3, padding='same', activation='relu')(inputs)
    p1 = layers.MaxPooling2D()(e1) # 32x80
    
    e2 = layers.Conv2D(128, 3, padding='same', activation='relu')(p1)
    p2 = layers.MaxPooling2D()(e2) # 16x40
    
    # --- BOTTLENECK ---
    # You used TWO residual blocks in your Kaggle training
    b = residual_block(p2, 128)
    b = residual_block(b, 128)
    
    # --- DECODER ---
    u1 = layers.UpSampling2D()(b)
    u1 = layers.Concatenate()([u1, e2]) # This creates 256 channels
    # The weight file for 'conv2d_4' expects (3, 3, 256, 128)
    u1 = layers.Conv2D(128, 3, padding='same', activation='relu')(u1)
    
    u2 = layers.UpSampling2D()(u1)
    u2 = layers.Concatenate()([u2, e1]) # This creates 192 channels (128+64)
    u2 = layers.Conv2D(64, 3, padding='same', activation='relu')(u2)
    
    # Final Output
    outputs = layers.Conv2D(3, 3, padding='same', activation='sigmoid')(u2)
    
    return models.Model(inputs, outputs)

# --- LOADING STRATEGY ---


def sharpen_output(image):
    kernel = np.array([[-1,-1,-1], [-1,9,-1], [-1,-1,-1]])
    sharpened = cv2.filter2D(image, -1, kernel)
    return cv2.addWeighted(image, 0.8, sharpened, 0.2, 0)

# --- 4. INITIALIZATION ---
ensure_landmarker()
print("⚙️ Building model and loading weights...")

# Rebuild the model and load weights manually
gaze_model = build_pro_unet()
if os.path.exists(GAZE_WEIGHTS_PATH):
    gaze_model.load_weights(GAZE_WEIGHTS_PATH)
    print("✅ Gaze weights loaded!")
else:
    print(f"❌ Error: Weights not found at {GAZE_WEIGHTS_PATH}")
    exit()

base_options = python.BaseOptions(model_asset_path=LANDMARKER_PATH)
options = vision.FaceLandmarkerOptions(base_options=base_options, num_faces=1)
detector = vision.FaceLandmarker.create_from_options(options)

# --- 5. INFERENCE (Production Grade) ---
image = cv2.imread(INPUT_IMAGE)
if image is None:
    print(f"❌ Could not find {INPUT_IMAGE}")
    exit()

h, w = image.shape[:2]
mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, 
                    data=cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
detection_result = detector.detect(mp_image)

def blend_patch(base, patch_bgr, y1, y2, x1, x2, feather=21):
    """
    Paste patch_bgr onto base using a feathered Gaussian mask.
    Eliminates hard rectangular seams completely.
    """
    h_patch, w_patch = y2 - y1, x2 - x1

    # Build a soft mask: 1.0 in center, 0.0 at edges
    mask = np.zeros((h_patch, w_patch), dtype=np.float32)
    pad = feather
    mask[pad:-pad, pad:-pad] = 1.0
    # Gaussian blur softens the edge
    mask = cv2.GaussianBlur(mask, (feather * 2 + 1, feather * 2 + 1), 0)
    mask = mask[:, :, np.newaxis]  # (H, W, 1) for broadcasting

    roi = base[y1:y2, x1:x2].astype(np.float32)
    patch = patch_bgr.astype(np.float32)

    blended = patch * mask + roi * (1.0 - mask)
    base[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)
    return base


def correct_eye(image, pred_eye_rgb):
    """
    Takes raw model output (float32, RGB, 0-1 range).
    Returns a clean BGR uint8 patch ready for blending.
    """
    # Step 1: Clip and convert to uint8 BGR — do this ONCE
    patch = (np.clip(pred_eye_rgb, 0, 1) * 255).astype(np.uint8)
    patch_bgr = cv2.cvtColor(patch, cv2.COLOR_RGB2BGR)

    # Step 2: Bilateral filter — smooths grid artifacts, preserves iris edges
    patch_bgr = cv2.bilateralFilter(patch_bgr, d=9, sigmaColor=75, sigmaSpace=75)

    # Step 3: Gentle color match to original skin tone area
    # (prevents the pasted region looking "washed out" vs the rest of the face)
    return patch_bgr


if detection_result.face_landmarks:
    landmarks = detection_result.face_landmarks[0]
    output_face = image.copy()

    # MediaPipe landmark indices for left and right eye corners + lids
    eye_groups = [
        [33, 133, 159, 145],   # Left eye
        [362, 263, 386, 374],  # Right eye
    ]

    for group in eye_groups:
        coords = [(landmarks[i].x * w, landmarks[i].y * h) for i in group]
        cx = int(np.mean([c[0] for c in coords]))
        cy = int(np.mean([c[1] for c in coords]))

        y1, y2 = cy - 32, cy + 32
        x1, x2 = cx - 80, cx + 80

        # Skip if eye region goes outside image bounds
        if y1 < 0 or y2 > h or x1 < 0 or x2 > w:
            print(f"⚠️  Eye region out of bounds, skipping. (cx={cx}, cy={cy})")
            continue

        # --- CROP ---
        eye_crop = image[y1:y2, x1:x2]  # BGR
        eye_input = cv2.cvtColor(eye_crop, cv2.COLOR_BGR2RGB) / 255.0  # RGB float

        # --- PREDICT ---
        pred_eye = gaze_model.predict(
            np.expand_dims(eye_input, axis=0), verbose=0
        )[0]

        print(f"Raw pred range: [{pred_eye.min():.4f}, {pred_eye.max():.4f}]")

        # --- CLEAN OUTPUT ---
        corrected_patch_bgr = correct_eye(image, pred_eye)  # ← make sure this line runs BEFORE debug

        # --- DEBUG BLOCK (add right here, after corrected_patch_bgr is defined) ---
        diff = cv2.absdiff(eye_crop, corrected_patch_bgr)
        print(f"Mean pixel difference (original vs corrected): {diff.mean():.4f}")
        cv2.imwrite("debug_original_eye.jpg", eye_crop)
        cv2.imwrite("debug_corrected_eye.jpg", corrected_patch_bgr)
        cv2.imwrite("debug_diff.jpg", diff * 10)

        # --- FEATHERED BLEND ---
        output_face = blend_patch(output_face, corrected_patch_bgr,
                                y1, y2, x1, x2, feather=21)

    cv2.imwrite(OUTPUT_IMAGE, output_face)
    print(f"✅ Saved to {OUTPUT_IMAGE}")

else:
    print("❌ No face landmarks detected.")