# 🎬 Video Studio

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=0:0d1117,100:238636&height=200&section=header&text=🎬%20Video%20Studio&fontSize=60&fontColor=ffffff&animation=fadeIn&desc=Local%20AI%20Video%20Editor%20—%20No%20Cloud.%20No%20GPU.%20Just%20Results.&descSize=20&descAlignY=75"/>
</p>

> **Your personal AI video studio** — runs entirely on your MacBook, controlled from any tablet on your network. No cloud. No subscriptions. No data leaves your device.

<p align="center">
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#roadmap">Roadmap</a>
</p>

<p align="center">
  <img src="https://img.shields.io/github/last-commit/neelkantnewra/video-studio" alt="Last commit"/>
  <img src="https://img.shields.io/github/license/neelkantnewra/video-studio" alt="License"/>
</p>

---

## ✨ Features

| | Feature | Status | Model | Notes |
|---|---------|--------|-------|-------|
| 🟢 | **AI Background Removal** | ✅ Ready | U2Net via rembg | ~2–3 min for 30s video |
| 🔵 | **Eye Contact Correction** | 🔧 In Progress | Custom U-Net trained on personal footage | Data collected, annotation done |
| 🟡 | **Annotation Studio** | ✅ Ready | MediaPipe FaceLandmarker | Built-in dataset builder |

---

<!-- ## 🎥 Demo

<p align="center">
  <img src="docs/demo.gif" alt="Video Studio in action" width="750"/>
</p>

Typical workflow:
1. Drop video on your tablet
2. MacBook processes frame-by-frame on CPU
3. Download finished result from any browser

--- -->

---

## 🧠 Eye Contact Pipeline

This is the most technically interesting part of the project.
Rather than using a generic model, we train a **personalized gaze correction model** —
specific to one face, one camera, one lighting setup.

### Why personalized?

    Generic models:              Personalized model:
    ❌ Trained on thousands      ✅ Trained on YOUR face
    ❌ Average correction        ✅ Exact iris position for your eyes
    ❌ Often looks unnatural     ✅ Preserves your natural eye shape
    ❌ Needs GPU at runtime      ✅ Runs on Mac CPU after training

### Full Pipeline

    Step 1 — Capture  (SetupPage in the app)
      Webcam records ~450 frames across 3 gaze directions:
      • at_camera    (150 frames)  ← ground truth / target
      • slightly_off (150 frames)  ← looking at screen edges
      • looking_away (150 frames)  ← looking at phone / keyboard

      Saved to:  backend/data/raw_captures/{session_id}/
      Also writes manifest.csv — maps each frame to its gaze label

    Step 2 — Annotation  (Annotation Studio tab in the app)
      MediaPipe FaceLandmarker runs LOCALLY (no GPU needed):
      • Detects both eyes with full eyelid landmarks
      • Locates iris center, pupil, eyelid upper/lower points
      • Pre-fills all landmarks automatically
      • User can drag handles to correct any errors
      • Saves per-frame JSON + annotations.csv per session

      Why local MediaPipe?
      → Kaggle has broken MediaPipe support in recent kernels
      → MediaPipe is CPU-only anyway — no GPU needed
      → Runs fine on MacBook

    Step 3 — Export
      Click "Export Training Pairs" in Annotation Studio:
      • Copies images → backend/data/training_pairs/inputs/
                        backend/data/training_pairs/targets/
      • Writes training_data.csv with all landmark coordinates

    Step 4 — Train on Kaggle GPU
      Upload training_pairs/ folder to Kaggle dataset
      Run kaggle_notebooks/eye_contact_training.ipynb
      • Reads training_data.csv — no MediaPipe needed on Kaggle ✅
      • Trains a U-Net style model:
          input  = face looking away
          output = face looking at camera
      • Downloads best weights → ml_models/eye_contact/

    Step 5 — Inference  (local, CPU)
      FastAPI loads weights at startup
      Applies gaze correction frame-by-frame during video processing
      No GPU required at inference time

### Annotation Studio

A full annotation tool built directly into the app — no external tools needed.

    Features:
    ✅ ⚡ Auto-annotate all frames with one click (MediaPipe)
    ✅ Both eyes annotated simultaneously
    ✅ Draggable iris center handles (green dots)
    ✅ Draggable eyelid point handles (blue dots)
    ✅ 9-direction gaze labeling grid
    ✅ Target frame marking (looking at camera = ground truth)
    ✅ Per-session progress tracking (done / pending counters)
    ✅ Frames grouped by gaze label
    ✅ Exports to CSV + image pairs for Kaggle training
    ✅ Keyboard shortcuts: A/D navigate · S save · T toggle target

---




## 🚀 Quick Start

## 🔧 Prerequisites

### 1. Python 3.11+

    # Check if installed
    python3 --version

    # Install via Homebrew (Mac)
    brew install python@3.11

### 2. Node.js 18+

    # Check if installed
    node --version

    # Install via Homebrew (Mac)
    brew install node

    # Or download from
    https://nodejs.org

### 3. FFmpeg

    # Check if installed
    ffmpeg -version

    # Install via Homebrew (Mac)
    brew install ffmpeg

    # Ubuntu / Debian
    sudo apt install ffmpeg

    # Windows
    https://ffmpeg.org/download.html

### 4. Homebrew (Mac only — needed for above)

    # Install Homebrew if you dont have it
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"


| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | brew install python@3.11 |
| Node.js | 18+ | brew install node |
| FFmpeg | Any | brew install ffmpeg |
| Homebrew | Latest | see above Mac only |
| RAM | 8GB+ | — |



### 1. Clone and configure

    git clone https://github.com/neelkantnewra/video-studio.git
    cd video-studio
    cp .env.example .env

<!-- <p align="center">
  <img src="docs/screenshots/terminal-clone.png" alt="Clone command" width="600"/>
</p> -->

### 2. Start Backend

    cd backend
    python -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

First run downloads U2Net weights (~170MB) to ~/.u2net/ automatically.

<!-- <p align="center">
  <img src="docs/screenshots/backend-running.png" alt="FastAPI server running" width="650"/>
</p> -->

### 3. Start Frontend

    cd frontend
    npm install
    npm run dev

<!-- <p align="center">
  <img src="docs/screenshots/frontend-running.png" alt="Vite dev server" width="650"/>
</p> -->

### 4. Open in Browser

| Device | URL |
|--------|-----|
| MacBook local | http://localhost:5173 |
| iPad or Android tablet | http://YOUR_MAC_IP:5173 |

<!-- <p align="center">
  <img src="docs/screenshots/tablet-view.png" alt="Android tablet interface" width="500"/>
</p> -->

---

## ⚙️ How It Works

Models are trained once on Kaggle T4 GPU, weights are downloaded and stored locally.
All inference runs on your Mac CPU at runtime — no GPU needed.

    Your video
        |
    FastAPI backend  <-->  React web UI (browser or tablet)
        |
    Frame-by-frame AI processing on CPU
        |
    Download processed video

---

## 🏗️ Architecture

### System Flow

    Browser (React + Vite)
        |  HTTP / REST
    FastAPI Server
        |               |               |
    /bg-removal    /eye-contact    /annotation
        |               |               |
    U2Net ONNX    Custom U-Net    MediaPipe FaceLandmarker

### Data Flow — Eye Contact

    SetupPage (webcam capture)
        → backend/data/raw_captures/{session_id}/
        → manifest.csv

    Annotation Studio
        → backend/data/annotated/{session_id}/annotations.csv
        → per-frame JSON

    Export
        → backend/data/training_pairs/inputs/
        → backend/data/training_pairs/targets/
        → backend/data/training_pairs/training_data.csv

    Kaggle Training
        → ml_models/eye_contact/eye_gaze_weights_best.weights.h5

    Inference
        → FastAPI applies correction frame-by-frame

---

## 📁 Project Structure

    video-studio/
    ├── backend/
    │   ├── main.py                     # Entry point + route registration
    │   ├── data/                       # Runtime data (gitignored)
    │   │   ├── raw_captures/           # Webcam frames per session
    │   │   ├── annotated/              # Landmark JSONs + annotations.csv
    │   │   └── training_pairs/         # Final training images + CSV
    │   └── app/
    │       ├── config.py               # Env vars and feature flags
    │       ├── routes/
    │       │   ├── bg_removal.py
    │       │   ├── eye_contact.py      # Frame capture + session management
    │       │   └── annotation.py       # MediaPipe auto-detect + annotation CRUD
    │       ├── services/               # Business logic and processing
    │       ├── models/                 # Model loader and registry
    │       └── utils/                  # Shared helpers
    │
    ├── frontend/
    │   └── src/
    │       ├── features/
    │       │   ├── eyeContact/         # SetupCard + SetupPage (capture flow)
    │       │   └── annotation/         # AnnotationTab + AnnotationCanvas
    │       ├── components/             # Shared UI components
    │       ├── pages/
    │       │   ├── Home.jsx
    │       │   └── AnnotationPage.jsx
    │       ├── api/
    │       │   ├── client.js
    │       │   └── annotationClient.js
    │       └── store/
    │           ├── useAppStore.js
    │           └── useAnnotationStore.js
    │
    ├── ml_models/                      # gitignored — weights only
    │   └── eye_contact/
    │       ├── face_landmarker.task    # MediaPipe model (auto-downloaded)
    │       └── *.weights.h5            # Trained gaze model (from Kaggle)
    │
    ├── notebooks/                      # Training notebooks
    └── temp/                           # Runtime only, gitignored

---

## 🔧 Feature Flags

Features are toggled via .env — no code changes needed:

    FEATURE_BG_REMOVAL=true
    FEATURE_EYE_CONTACT=true

---

## 🧠 ML Model Weights

Weights are not committed to git.

| Model | Source | Location |
|-------|--------|----------|
| U2Net bg removal | Auto-downloaded on first run | ~/.u2net/ |
| MediaPipe FaceLandmarker | Auto-downloaded on first run | ml_models/eye_contact/ |
| Eye contact gaze model | Train via Kaggle notebook | ml_models/eye_contact/*.h5 |

---

## 📊 Training Data Format

training_data.csv — generated by Annotation Studio export:

| Column | Description |
|--------|-------------|
| session_id | Capture session identifier |
| frame_id | Frame filename without extension |
| gaze_direction | camera / left / right / up / down etc |
| is_target_frame | true = looking at camera (ground truth) |
| l_iris_x / l_iris_y | Left iris center in pixels |
| r_iris_x / r_iris_y | Right iris center in pixels |
| l_iris_radius / r_iris_radius | Iris radius in pixels |
| l_openness / r_openness | Eye openness ratio |
| l_upper_eyelid / l_lower_eyelid | JSON array of eyelid points |
| r_upper_eyelid / r_lower_eyelid | JSON array of eyelid points |
| head_yaw / head_pitch / head_roll | Head pose angles |
| manually_corrected | Pipe-separated list of hand-corrected fields |
| annotated_at | ISO timestamp of annotation |

---

## 🛠️ Development

### Useful Commands

    make dev-backend      # Start FastAPI with hot reload
    make dev-frontend     # Start Vite dev server
    make clean            # Purge temp files

### Adding a New Feature

    1. Add route    →  backend/app/routes/your_feature.py
    2. Add service  →  backend/app/services/your_feature_service.py
    3. Add flag     →  .env and config.py
    4. Register     →  backend/main.py
    5. Add UI       →  frontend/src/features/yourFeature/

---

## 🗺️ Roadmap

- [x] Project architecture and GitHub setup
- [x] Background removal — backend pipeline
- [x] Background removal — web UI
- [x] Eye contact — mathematical gaze warping approach
- [x] Eye contact — smart correction with downward gaze skip
- [x] Eye contact — webcam data capture with session management
- [x] Eye contact — Annotation Studio with MediaPipe auto-detection
- [x] Eye contact — dual eye landmark annotation (both eyes simultaneously)
- [x] Eye contact — eyelid point annotation (upper + lower per eye)
- [x] Eye contact — CSV export format for Kaggle training
- [x] Eye contact — sound cues during capture (Web Audio API)
- [x] Eye contact — countdown timer before capture starts
- [ ] Eye contact — Kaggle training notebook (U-Net on personal footage)
- [ ] Eye contact — inference pipeline with trained weights
- [ ] Eye contact — full video processing integration
- [ ] Android tablet optimised layout
- [ ] ONNX export for faster CPU inference

---

## 🤝 Contributing

Contributions that improve the architecture or documentation are welcome.

    git checkout -b feature/your-description
    # Commit with conventional commits:
    # feat:  fix:  docs:  refactor:

### Welcome contributions

| Type | Example |
|------|---------|
| 🐛 Bug fixes | ONNX loading on Windows |
| 📚 Docs | Better Kaggle notebook guide |
| 🔧 Refactors | Cleaner model registry pattern |
| 🎨 UI/UX | Tablet-optimized layout |

### Will not merge

- Cloud-native rewrites — defeats local-first purpose
- GPU runtime requirements — must run on Mac CPU at inference
- General-purpose model weights — personal tool by design

---

## 📝 Personal Note

Built for my own workflow — recording courses, removing backgrounds,
fixing eye contact on a MacBook without expensive cloud tools.

The eye contact model is trained entirely on my own footage using a
custom annotation pipeline built into the app itself.
No third-party annotation tools. No external datasets.

Open-sourced in case the architecture is useful to others
building personal AI tools.

---

## 📜 License

MIT — free to use, modify, and train your own models.

---

## 🙏 Acknowledgments

- U2Net          https://github.com/xuebinqin/U-2-Net
- rembg          https://github.com/danielgatis/rembg
- MediaPipe      https://github.com/google-ai-edge/mediapipe
- ONNX Runtime   https://onnxruntime.ai

---

Star this repo if you found it helpful!
https://github.com/neelkantnewra/video-studio