import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, models
import os

# ─────────────────────────────────────────────────────────────────────────────
# 1. PATH SETUP
# ─────────────────────────────────────────────────────────────────────────────
current_script_dir = os.path.dirname(os.path.abspath(__file__))

KERAS_PATH   = os.path.normpath(os.path.join(current_script_dir, '..', 'ml_models', 'eye_contact', 'eye_gaze_model.keras'))
WEIGHTS_PATH = os.path.normpath(os.path.join(current_script_dir, '..', 'ml_models', 'eye_contact', 'eye_gaze_weights.weights.h5'))

# ─────────────────────────────────────────────────────────────────────────────
# 2. MODEL LOADING
# ─────────────────────────────────────────────────────────────────────────────
def build_model():
    base_model = tf.keras.applications.MobileNetV2(
        input_shape=(224, 224, 3),
        include_top=False,
        weights=None
    )
    base_model.trainable = False
    model = models.Sequential([
        base_model,
        layers.GlobalAveragePooling2D(),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.2),
        layers.Dense(3, activation='softmax')
    ])
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
    return model

def load_gaze_model():
    print("🔄 Strategy 1: Loading from .keras file...")
    try:
        model = tf.keras.models.load_model(KERAS_PATH)
        print("✅ SUCCESS via .keras file!")
        return model
    except Exception as e:
        print(f"⚠️  .keras load failed: {e}\n")

    print("🔄 Strategy 2: Rebuilding exact training architecture + injecting weights...")
    try:
        model = build_model()
        model.load_weights(WEIGHTS_PATH)
        print("✅ SUCCESS via architecture rebuild + weights!")
        return model
    except Exception as e:
        print(f"❌ All strategies failed: {e}")
        exit(1)

gaze_model = load_gaze_model()

# ─────────────────────────────────────────────────────────────────────────────
# 3. MEDIAPIPE SETUP
# ─────────────────────────────────────────────────────────────────────────────
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=True,
    refine_landmarks=True,
    min_detection_confidence=0.5
)

CATEGORIES       = ['at_camera', 'looking_away', 'slightly_off']
SLIGHTLY_OFF_IDX = 2

LEFT_EYE_CORNERS  = [33,  133, 159, 145]
RIGHT_EYE_CORNERS = [362, 263, 386, 374]
LEFT_IRIS         = [468, 469, 470, 471, 472]
RIGHT_IRIS        = [473, 474, 475, 476, 477]

# solvePnP reference points
FACE_3D_MODEL = np.array([
    [0.0,    0.0,    0.0   ],
    [0.0,   -330.0, -65.0 ],
    [-225.0,  170.0, -135.0],
    [225.0,   170.0, -135.0],
    [-150.0, -150.0, -125.0],
    [150.0,  -150.0, -125.0],
], dtype=np.float64)
FACE_LM_IDS = [4, 152, 33, 263, 61, 291]

# ─────────────────────────────────────────────────────────────────────────────
# 4. HEAD POSE
# ─────────────────────────────────────────────────────────────────────────────
def get_head_pose(lm, iw, ih):
    img_pts = np.array([[lm[i].x * iw, lm[i].y * ih] for i in FACE_LM_IDS], dtype=np.float64)
    focal   = iw
    center  = (iw / 2, ih / 2)
    cam_mat = np.array([[focal,0,center[0]],[0,focal,center[1]],[0,0,1]], dtype=np.float64)
    dist    = np.zeros((4,1), dtype=np.float64)
    ok, rvec, _ = cv2.solvePnP(FACE_3D_MODEL, img_pts, cam_mat, dist, flags=cv2.SOLVEPNP_ITERATIVE)
    if not ok:
        return 0.0, 0.0
    rmat, _ = cv2.Rodrigues(rvec)
    sy      = np.sqrt(rmat[0,0]**2 + rmat[1,0]**2)
    pitch   = np.degrees(np.arctan2(-rmat[2,0], sy))
    yaw     = np.degrees(np.arctan2(rmat[1,0], rmat[0,0]))
    return pitch, yaw

# ─────────────────────────────────────────────────────────────────────────────
# 5. HELPERS
# ─────────────────────────────────────────────────────────────────────────────
def lm_to_px(lm_list, indices, w, h):
    return np.array([[lm_list[i].x * w, lm_list[i].y * h]
                     for i in indices], dtype=np.float32)

def get_eye_roi(img, lm, corner_indices, pad=14):
    ih, iw = img.shape[:2]
    pts = lm_to_px(lm, corner_indices, iw, ih)
    x1  = max(0,  int(pts[:,0].min()) - pad)
    y1  = max(0,  int(pts[:,1].min()) - pad)
    x2  = min(iw, int(pts[:,0].max()) + pad)
    y2  = min(ih, int(pts[:,1].max()) + pad)
    return img[y1:y2, x1:x2].copy()

def classify_eye(roi):
    if roi.size == 0:
        return 'at_camera', 0.0, np.zeros(3)
    inp  = np.expand_dims(cv2.resize(roi, (224,224)) / 255.0, axis=0)
    pred = gaze_model.predict(inp, verbose=0)[0]
    return CATEGORIES[np.argmax(pred)], float(np.max(pred))*100, pred

def sample_sclera_color(img, iris_cx, iris_cy, iris_radius, dx, dy):
    """
    Sample the average sclera color from the side OPPOSITE to the shift direction.
    This gives us the correct fill color for the vacated area.
    """
    # Sample from the direction opposite to movement
    sample_x = int(iris_cx - dx * 2)
    sample_y = int(iris_cy - dy * 2)
    ih, iw   = img.shape[:2]

    # Small region to sample color from
    r   = max(3, iris_radius // 3)
    sx1 = max(0,  sample_x - r)
    sy1 = max(0,  sample_y - r)
    sx2 = min(iw, sample_x + r)
    sy2 = min(ih, sample_y + r)

    region = img[sy1:sy2, sx1:sx2]
    if region.size == 0:
        return np.array([255, 255, 255], dtype=np.uint8)  # fallback white
    return region.mean(axis=(0, 1)).astype(np.uint8)

# ─────────────────────────────────────────────────────────────────────────────
# 6. IRIS CORRECTION — with ghost fix + sclera fill
# ─────────────────────────────────────────────────────────────────────────────
def correct_iris(img, iris_pts, pitch_deg, yaw_deg, slightly_off_conf):
    """
    Proper 3-step correction:
      Step 1 — Fill the original iris location with sampled sclera color
      Step 2 — Draw the shifted iris at the new position
      Step 3 — Feather-blend both operations for natural look
    """
    out = img.copy()
    ih, iw = img.shape[:2]

    iris_center = iris_pts[0].copy()
    iris_radius = int(np.linalg.norm(iris_pts[1] - iris_pts[3]) / 2) + 3

    # ── shift magnitude from confidence ──────────────────────────────────────
    conf_ratio      = np.clip((slightly_off_conf - 50.0)/50, 0.0, 1.0)
    shift_magnitude = iris_radius * 0.20 * conf_ratio

    # ── shift direction from head pose ────────────────────────────────────────
    pitch_rad = np.radians(np.clip(pitch_deg, -30, 30))
    yaw_rad   = np.radians(np.clip(yaw_deg,   -30, 30))
    dir_y = -np.sin(pitch_rad)
    dir_x = -np.sin(yaw_rad)
    mag   = np.sqrt(dir_x**2 + dir_y**2)
    if mag > 1e-6:
        dir_x /= mag
        dir_y /= mag
    else:
        dir_x, dir_y = 0.0, -1.0   # default: shift up

    dx = dir_x * shift_magnitude
    dy = dir_y * shift_magnitude

    print(f"      iris centre    : ({iris_center[0]:.1f}, {iris_center[1]:.1f})")
    print(f"      iris radius    : {iris_radius}px")
    print(f"      pitch/yaw      : {pitch_deg:.1f}° / {yaw_deg:.1f}°")
    print(f"      shift magnitude: {shift_magnitude:.1f}px  →  dx={dx:.2f}  dy={dy:.2f}")

    if shift_magnitude < 0.5:
        print("      ↳ Shift too small, skipping.")
        return out

    cx, cy = int(iris_center[0]), int(iris_center[1])
    new_cx = int(cx + dx)
    new_cy = int(cy + dy)

    # ── STEP 1: Sample sclera color from the vacating side ───────────────────
    sclera_color = sample_sclera_color(img, cx, cy, iris_radius, dx*shift_magnitude, dy*shift_magnitude)
    print(f"      sclera color   : {sclera_color}")

    # ── STEP 2: Paint over the OLD iris position with sclera ─────────────────
    # Create a soft sclera fill mask
    fill_mask = np.zeros((ih, iw), dtype=np.float32)
    cv2.circle(fill_mask, (cx, cy), iris_radius, 1.0, -1)
    ksize     = max(3, (iris_radius // 2) * 2 + 1)
    fill_mask = cv2.GaussianBlur(fill_mask, (ksize, ksize), iris_radius / 4.0)

    # Sclera fill layer
    sclera_layer       = out.copy()
    sclera_layer[:]    = sclera_color
    fill_mask3         = fill_mask[:, :, np.newaxis]
    out = (sclera_layer * fill_mask3 + out * (1 - fill_mask3)).astype(np.uint8)

    # ── STEP 3: Stamp the iris at the NEW position ────────────────────────────
    # Extract original iris patch
    pad  = iris_radius + 6
    ox1  = max(0,  cx - pad);  ox2 = min(iw, cx + pad)
    oy1  = max(0,  cy - pad);  oy2 = min(ih, cy + pad)
    iris_patch = img[oy1:oy2, ox1:ox2].copy()

    # Destination region at new position
    nx1  = max(0,  new_cx - pad);  nx2 = min(iw, new_cx + pad)
    ny1  = max(0,  new_cy - pad);  ny2 = min(ih, new_cy + pad)

    # Clip patch size to destination bounds
    ph   = min(iris_patch.shape[0], ny2 - ny1)
    pw   = min(iris_patch.shape[1], nx2 - nx1)
    iris_patch = iris_patch[:ph, :pw]

    # Build iris mask at new position
    iris_mask         = np.zeros((ph, pw), dtype=np.float32)
    local_cx          = min(pad, new_cx)
    local_cy          = min(pad, new_cy)
    cv2.circle(iris_mask, (local_cx, local_cy), iris_radius, 1.0, -1)
    iris_mask         = cv2.GaussianBlur(iris_mask, (ksize, ksize), iris_radius / 4.0)

    iris_mask3        = iris_mask[:, :, np.newaxis]
    dest_region       = out[ny1:ny1+ph, nx1:nx1+pw]
    blended           = (iris_patch * iris_mask3 + dest_region * (1 - iris_mask3)).astype(np.uint8)
    out[ny1:ny1+ph, nx1:nx1+pw] = blended

    return out

# ─────────────────────────────────────────────────────────────────────────────
# 7. MAIN
# ─────────────────────────────────────────────────────────────────────────────
def process_image(image_path):
    img = cv2.imread(image_path)
    if img is None:
        print(f"❌ Cannot read: {image_path}"); return

    ih, iw  = img.shape[:2]
    results = face_mesh.process(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))

    if not results.multi_face_landmarks:
        print("⚠️  No face detected."); return

    lm  = results.multi_face_landmarks[0].landmark
    out = img.copy()

    pitch_deg, yaw_deg = get_head_pose(lm, iw, ih)
    print(f"\n🧭 Head Pose → pitch={pitch_deg:.1f}°  yaw={yaw_deg:.1f}°\n")

    for cfg in [
        {'label': 'Left',  'corners': LEFT_EYE_CORNERS,  'iris': LEFT_IRIS },
        {'label': 'Right', 'corners': RIGHT_EYE_CORNERS, 'iris': RIGHT_IRIS},
    ]:
        roi              = get_eye_roi(img, lm, cfg['corners'])
        label, conf, pred = classify_eye(roi)
        so_conf          = float(pred[SLIGHTLY_OFF_IDX]) * 100

        print(f"👁️  {cfg['label']} Eye → {label} ({conf:.1f}%)")

        if label == 'slightly_off':
            iris_pts = lm_to_px(lm, cfg['iris'], iw, ih)
            out      = correct_iris(out, iris_pts, pitch_deg, yaw_deg, so_conf)
            print(f"   ✨ Correction applied.")
        else:
            print(f"   ℹ️  Skipping ({label}).")

    base, ext   = os.path.splitext(image_path)
    output_path = f"{base}_corrected{ext}"
    cv2.imwrite(output_path, out)
    print(f"\n💾 Saved: {output_path}")

    cv2.imshow('Original  |  Corrected', np.hstack([img, out]))
    cv2.waitKey(0)
    cv2.destroyAllWindows()

# ─────────────────────────────────────────────────────────────────────────────
# 8. RUN
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    process_image('test2.jpg')