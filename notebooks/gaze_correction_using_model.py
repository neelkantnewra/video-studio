import os
import cv2
import requests
import numpy as np
import tensorflow as tf
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from tensorflow.keras import layers, models

# --- 1. PATH CONFIGURATION ---
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir = os.path.join(current_dir, "..")

MODEL_FOLDER = os.path.join(root_dir, "ml_models", "eye_contact")
LANDMARKER_PATH = os.path.join(MODEL_FOLDER, "face_landmarker.task")
GAZE_WEIGHTS_PATH = os.path.join(MODEL_FOLDER, "eye_gaze_weights_best.weights.h5")

INPUT_IMAGE = "/Users/neelkantnewra/Desktop/video-studio/kaggle_notebooks/test2.jpg"
OUTPUT_IMAGE = "/Users/neelkantnewra/Desktop/video-studio/kaggle_notebooks/test_corrected.jpg"

EYE_H, EYE_W = 64, 160  # Must match training exactly

# --- 2. AUTO-DOWNLOAD ---
def ensure_landmarker():
    if not os.path.exists(MODEL_FOLDER):
        os.makedirs(MODEL_FOLDER)
    if not os.path.exists(LANDMARKER_PATH):
        url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
        print(f"⏳ Downloading MediaPipe model...")
        response = requests.get(url, stream=True)
        with open(LANDMARKER_PATH, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        print("✅ Download complete!")

# --- 3. MODEL ARCHITECTURE ---
def residual_block(x, filters):
    shortcut = x
    x = layers.Conv2D(filters, 3, padding='same', activation='relu')(x)
    x = layers.Conv2D(filters, 3, padding='same')(x)
    x = layers.Add()([x, shortcut])
    return layers.Activation('relu')(x)

def build_pro_unet(input_shape=(64, 160, 3)):
    inputs = layers.Input(shape=input_shape)
    
    # Encoder
    e1 = layers.Conv2D(64, 3, padding='same', activation='relu')(inputs)
    p1 = layers.MaxPooling2D()(e1)
    
    e2 = layers.Conv2D(128, 3, padding='same', activation='relu')(p1)
    p2 = layers.MaxPooling2D()(e2)
    
    # Bottleneck
    b = residual_block(p2, 128)
    b = residual_block(b, 128)
    
    # Decoder
    u1 = layers.UpSampling2D()(b)
    u1 = layers.Concatenate()([u1, e2])
    u1 = layers.Conv2D(128, 3, padding='same', activation='relu')(u1)
    
    u2 = layers.UpSampling2D()(u1)
    u2 = layers.Concatenate()([u2, e1])
    u2 = layers.Conv2D(64, 3, padding='same', activation='relu')(u2)
    
    outputs = layers.Conv2D(3, 3, padding='same', activation='sigmoid')(u2)
    
    return models.Model(inputs, outputs)

# --- 4. QUALITY GATE ---
def is_correction_valid(original_bgr, corrected_bgr, 
                         max_diff_threshold=30.0,
                         min_diff_threshold=0.5):
    """
    Rejects hallucinated/garbage model outputs.
    Returns True only if correction is sane.
    """
    diff = cv2.absdiff(original_bgr, corrected_bgr)
    mean_diff = diff.mean()
    
    print(f"  → Mean pixel diff: {mean_diff:.2f}")
    
    # If model output is wildly different → hallucination
    if mean_diff > max_diff_threshold:
        print(f"  ❌ REJECTED: Diff {mean_diff:.2f} > threshold {max_diff_threshold}")
        return False
    
    # If model output is identical → no correction happened  
    if mean_diff < min_diff_threshold:
        print(f"  ⚠️  SKIPPED: Diff {mean_diff:.2f} < {min_diff_threshold} (no change)")
        return False
    
    print(f"  ✅ ACCEPTED: Correction looks sane")
    return True

# --- 5. COLOR MATCHING ---
def color_match(source_bgr, target_bgr):
    """
    Match color statistics of source to target.
    Prevents color shift after model correction.
    """
    source = source_bgr.astype(np.float32)
    target = target_bgr.astype(np.float32)
    
    # Match mean and std per channel
    for c in range(3):
        src_mean, src_std = source[:,:,c].mean(), source[:,:,c].std()
        tgt_mean, tgt_std = target[:,:,c].mean(), target[:,:,c].std()
        
        if src_std > 0:
            source[:,:,c] = (source[:,:,c] - src_mean) * (tgt_std / src_std) + tgt_mean
    
    return np.clip(source, 0, 255).astype(np.uint8)

# --- 6. FEATHERED BLENDING ---
def blend_patch(base, patch_bgr, y1, y2, x1, x2, feather=15):
    """
    Paste patch onto base with Gaussian feathering.
    Eliminates hard rectangular seams.
    """
    h_patch, w_patch = y2 - y1, x2 - x1
    
    # Validate patch size
    if patch_bgr.shape[:2] != (h_patch, w_patch):
        patch_bgr = cv2.resize(patch_bgr, (w_patch, h_patch))
    
    # Build feathered mask
    mask = np.zeros((h_patch, w_patch), dtype=np.float32)
    pad = feather
    
    # Safety check: pad must leave interior
    if pad * 2 < h_patch and pad * 2 < w_patch:
        mask[pad:-pad, pad:-pad] = 1.0
    else:
        mask[:, :] = 1.0  # No padding possible, use hard blend
    
    mask = cv2.GaussianBlur(mask, (feather * 2 + 1, feather * 2 + 1), 0)
    mask = mask[:, :, np.newaxis]  # (H, W, 1)
    
    roi = base[y1:y2, x1:x2].astype(np.float32)
    patch = patch_bgr.astype(np.float32)
    
    blended = patch * mask + roi * (1.0 - mask)
    base[y1:y2, x1:x2] = np.clip(blended, 0, 255).astype(np.uint8)
    return base

# --- 7. PROCESS SINGLE EYE ---
def process_eye(image, gaze_model, cx, cy, eye_label="eye", 
                debug=True, quality_gate=True):
    """
    Full pipeline for one eye: crop → predict → validate → blend.
    Returns modified image.
    """
    h, w = image.shape[:2]
    half_h, half_w = EYE_H // 2, EYE_W // 2
    
    y1 = cy - half_h
    y2 = cy + half_h
    x1 = cx - half_w
    x2 = cx + half_w
    
    # Bounds check
    if y1 < 0 or y2 > h or x1 < 0 or x2 > w:
        print(f"  ⚠️  {eye_label}: Out of bounds (cx={cx}, cy={cy}), skipping.")
        return image
    
    # --- CROP ---
    eye_crop_bgr = image[y1:y2, x1:x2].copy()
    
    # --- NORMALIZE (must match training!) ---
    eye_input_rgb = cv2.cvtColor(eye_crop_bgr, cv2.COLOR_BGR2RGB)
    eye_input_norm = eye_input_rgb.astype(np.float32) / 255.0
    
    # --- PREDICT ---
    pred = gaze_model.predict(
        np.expand_dims(eye_input_norm, axis=0), verbose=0
    )[0]  # Shape: (64, 160, 3), float32, range 0-1
    
    print(f"\n  [{eye_label}] Pred range: [{pred.min():.4f}, {pred.max():.4f}]")
    
    # --- CONVERT TO BGR UINT8 ---
    pred_rgb_uint8 = (np.clip(pred, 0, 1) * 255).astype(np.uint8)
    pred_bgr = cv2.cvtColor(pred_rgb_uint8, cv2.COLOR_RGB2BGR)
    
    # --- COLOR MATCH to preserve skin tone ---
    pred_bgr = color_match(pred_bgr, eye_crop_bgr)
    
    # --- POST PROCESS ---
    pred_bgr = cv2.bilateralFilter(pred_bgr, d=7, sigmaColor=50, sigmaSpace=50)
    
    # --- DEBUG SAVES ---
    if debug:
        cv2.imwrite(f"debug_{eye_label}_original.jpg", eye_crop_bgr)
        cv2.imwrite(f"debug_{eye_label}_corrected.jpg", pred_bgr)
        diff = cv2.absdiff(eye_crop_bgr, pred_bgr)
        cv2.imwrite(f"debug_{eye_label}_diff.jpg", diff * 5)
    
    # --- QUALITY GATE ---
    if quality_gate and not is_correction_valid(eye_crop_bgr, pred_bgr):
        print(f"  ⚠️  {eye_label}: Quality gate failed, using original.")
        return image  # Return unchanged image
    
    # --- BLEND BACK ---
    image = blend_patch(image, pred_bgr, y1, y2, x1, x2, feather=15)
    print(f"  ✅ {eye_label}: Correction applied.")
    
    return image

# --- 8. MAIN PIPELINE ---
def run_gaze_correction(input_path, output_path, gaze_model, detector):
    image = cv2.imread(input_path)
    if image is None:
        print(f"❌ Could not load: {input_path}")
        return
    
    h, w = image.shape[:2]
    print(f"📷 Image: {w}x{h}")
    
    # Detect landmarks
    mp_image = mp.Image(
        image_format=mp.ImageFormat.SRGB,
        data=cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    )
    detection_result = detector.detect(mp_image)
    
    if not detection_result.face_landmarks:
        print("❌ No face detected.")
        return
    
    landmarks = detection_result.face_landmarks[0]
    output_face = image.copy()
    
    # Eye landmark groups (MediaPipe indices)
    eye_configs = [
        {
            "label": "left_eye",
            # Wider set of landmarks for better center estimation
            "indices": [33, 133, 159, 145, 153, 144, 163, 7]
        },
        {
            "label": "right_eye", 
            "indices": [362, 263, 386, 374, 380, 381, 382, 249]
        }
    ]
    
    for eye_cfg in eye_configs:
        coords = [
            (landmarks[i].x * w, landmarks[i].y * h) 
            for i in eye_cfg["indices"]
        ]
        cx = int(np.mean([c[0] for c in coords]))
        cy = int(np.mean([c[1] for c in coords]))
        
        print(f"\n👁️  Processing {eye_cfg['label']} (center: {cx}, {cy})")
        
        output_face = process_eye(
            output_face, gaze_model,
            cx, cy,
            eye_label=eye_cfg["label"],
            debug=True,
            quality_gate=True  # ← KEY: rejects garbage outputs
        )
    
    cv2.imwrite(output_path, output_face)
    print(f"\n✅ Saved: {output_path}")

# --- 9. INITIALIZE & RUN ---
ensure_landmarker()

print("⚙️  Building model and loading weights...")
gaze_model = build_pro_unet(input_shape=(EYE_H, EYE_W, 3))

if os.path.exists(GAZE_WEIGHTS_PATH):
    gaze_model.load_weights(GAZE_WEIGHTS_PATH)
    print("✅ Weights loaded!")
else:
    print(f"❌ Weights not found: {GAZE_WEIGHTS_PATH}")
    exit()

# MediaPipe detector
base_options = python.BaseOptions(model_asset_path=LANDMARKER_PATH)
options = vision.FaceLandmarkerOptions(
    base_options=base_options, 
    num_faces=1
)
detector = vision.FaceLandmarker.create_from_options(options)

# Run
run_gaze_correction(INPUT_IMAGE, OUTPUT_IMAGE, gaze_model, detector)