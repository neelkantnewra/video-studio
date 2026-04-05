import cv2
import mediapipe as mp
import numpy as np
import os
import pandas as pd

# ─────────────────────────────────────────────────────────────────────────────
# 1. CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
IMG_SIZE = (160, 64)  
BASE_PROJECT_DIR = "/Users/neelkantnewra/Desktop/video-studio"
RAW_DIR = os.path.join(BASE_PROJECT_DIR, 'backend', 'tests', 'samples', 'frames')
OUT_DIR = os.path.join(BASE_PROJECT_DIR, 'ml_models', 'eye_contact', 'processed_tensors')
MANIFEST_PATH = os.path.join(BASE_PROJECT_DIR, 'ml_models', 'eye_contact', 'manifest.csv')

# Lighting Normalizer (CLAHE)
clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))

# MediaPipe Setup
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=True, 
    refine_landmarks=True, 
    max_num_faces=1
)

# Landmark Indices
LEFT_EYE_CORNERS = [33, 133]
RIGHT_EYE_CORNERS = [362, 263]
LEFT_IRIS_CENTER = 468
RIGHT_IRIS_CENTER = 473
# Eyelid indices for blink detection
LEFT_LIDS = [159, 145] 
RIGHT_LIDS = [386, 374]

# ─────────────────────────────────────────────────────────────────────────────
# 2. CORE TRANSFORMATION ENGINE
# ─────────────────────────────────────────────────────────────────────────────
def extract_eye_sample(img, lm, eye_type="left"):
    ih, iw = img.shape[:2]
    
    # 1. Select Indices
    idx1, idx2 = (LEFT_EYE_CORNERS if eye_type == "left" else RIGHT_EYE_CORNERS)
    iris_idx = (LEFT_IRIS_CENTER if eye_type == "left" else RIGHT_IRIS_CENTER)
    lid_idx = (LEFT_LIDS if eye_type == "left" else RIGHT_LIDS)
    
    # 2. Blink Detection (Skip if eye is closed)
    upper_lid = np.array([lm[lid_idx[0]].x * iw, lm[lid_idx[0]].y * ih])
    lower_lid = np.array([lm[lid_idx[1]].x * iw, lm[lid_idx[1]].y * ih])
    dist = np.linalg.norm(upper_lid - lower_lid)
    if dist < (ih * 0.015): # Threshold for closed eye
        return None, None

    # 3. Points for Alignment
    p1 = np.array([lm[idx1].x * iw, lm[idx1].y * ih])
    p2 = np.array([lm[idx2].x * iw, lm[idx2].y * ih])
    iris_pt = np.array([lm[iris_idx].x * iw, lm[iris_idx].y * ih, 1])
    
    # 4. Rotation Alignment
    center = (p1 + p2) / 2
    angle = np.degrees(np.arctan2(p2[1] - p1[1], p2[0] - p1[0]))
    M = cv2.getRotationMatrix2D(tuple(center), angle, 1.0)
    rotated = cv2.warpAffine(img, M, (iw, ih))

    # 5. Transform Iris Coord to Rotated/Cropped Space
    rotated_iris = M @ iris_pt
    x1, y1 = int(center[0] - IMG_SIZE[0]//2), int(center[1] - IMG_SIZE[1]//2)
    ix_local = (rotated_iris[0] - x1) / IMG_SIZE[0]
    iy_local = (rotated_iris[1] - y1) / IMG_SIZE[1]
    
    # 6. Crop & Resize
    crop = rotated[max(0,y1):min(ih,y1+64), max(0,x1):min(iw,x1+160)]
    if crop.shape[:2] != (64, 160):
        crop = cv2.resize(crop, (160, 64))

    # 7. Lighting Enhancement (CLAHE in LAB space)
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    l = clahe.apply(l)
    crop = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)

    # 8. Symmetery Flip for Right Eye
    final_coords = np.array([ix_local, iy_local], dtype=np.float32)
    if eye_type == "right":
        crop = cv2.flip(crop, 1)
        final_coords[0] = 1.0 - final_coords[0]

    return (crop.astype(np.float32) / 255.0), final_coords

# ─────────────────────────────────────────────────────────────────────────────
# 3. PROCESSING LOOP
# ─────────────────────────────────────────────────────────────────────────────
def run_main():
    if not os.path.exists(OUT_DIR): os.makedirs(OUT_DIR)
    
    off_path = os.path.join(RAW_DIR, 'slightly_off')
    on_path  = os.path.join(RAW_DIR, 'at_camera')
    manifest = []
    
    files = [f for f in os.listdir(off_path) if f.lower().endswith(('.jpg', '.png'))]
    print(f"🚀 Starting processing for {len(files)} face pairs...")

    for fname in files:
        file_id = "".join(filter(str.isdigit, fname)) 
        target_fname = next((c for c in os.listdir(on_path) if file_id in c), None)
        if not target_fname: continue

        img_x = cv2.imread(os.path.join(off_path, fname))
        img_y = cv2.imread(os.path.join(on_path, target_fname))

        res_x = face_mesh.process(cv2.cvtColor(img_x, cv2.COLOR_BGR2RGB))
        res_y = face_mesh.process(cv2.cvtColor(img_y, cv2.COLOR_BGR2RGB))
        
        if res_x.multi_face_landmarks and res_y.multi_face_landmarks:
            lm_x = res_x.multi_face_landmarks[0].landmark
            lm_y = res_y.multi_face_landmarks[0].landmark
            
            for side in ["left", "right"]:
                eye_x, _ = extract_eye_sample(img_x, lm_x, side)
                eye_y, target_coords = extract_eye_sample(img_y, lm_y, side)

                if eye_x is not None and eye_y is not None:
                    x_name = f"x_{file_id}_{side}.npy"
                    y_name = f"y_{file_id}_{side}.npy"
                    c_name = f"c_{file_id}_{side}.npy" # Target Coordinates
                    
                    np.save(os.path.join(OUT_DIR, x_name), eye_x)
                    np.save(os.path.join(OUT_DIR, y_name), eye_y)
                    np.save(os.path.join(OUT_DIR, c_name), target_coords)
                    
                    manifest.append({
                        'id': file_id, 'side': side,
                        'x_file': x_name, 'y_file': y_name, 'c_file': c_name
                    })
            
    pd.DataFrame(manifest).to_csv(MANIFEST_PATH, index=False)
    print(f"✨ DONE: {len(manifest)} eye samples saved to {OUT_DIR}")


def check():
    import matplotlib.pyplot as plt
    import numpy as np
    import os

    # Pick a random right eye to see the flip
    sample_x = np.load(os.path.join(OUT_DIR, 'x_000100_right.npy')) # Change 100 to any ID you have
    sample_y = np.load(os.path.join(OUT_DIR, 'y_000100_right.npy'))
    coords = np.load(os.path.join(OUT_DIR, 'c_000100_right.npy'))

    plt.figure(figsize=(10, 4))
    plt.subplot(1, 2, 1); plt.imshow(sample_x); plt.title("Input (Flipped Right)")
    plt.subplot(1, 2, 2); plt.imshow(sample_y); plt.title("Target")
    plt.scatter(coords[0] * 160, coords[1] * 64, c='red', s=40, label='Iris Center')
    plt.legend()
    plt.show()

if __name__ == "__main__":
    run_main()