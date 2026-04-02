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

| | Feature | Status | Model | Speed |
|---|---------|--------|-------|-------|
| 🟢 | **AI Background Removal** | ✅ Ready | U2Net via rembg | ~2-3 min for 30s video |
| 🔵 | **Eye Contact Correction** | 🔧 Training | Custom Kaggle-trained | Coming soon |

<!-- <p align="center">
  <img src="docs/screenshots/feature-bg-removal.png" alt="Background removal result" width="700"/>
</p> -->

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
        |  HTTP
    FastAPI Server
        |              |
    /bg-removal    /eye-contact (planned)
        |              |
    U2Net ONNX    Custom Model
        |
    WebSocket progress updates back to browser

### Data Flow — Background Removal

    User uploads video
        --> POST /bg-removal/upload
        --> BG Service starts processing
        --> U2Net runs frame-by-frame inference
        --> Alpha mask applied per frame
        --> Progress pushed via WebSocket
        --> Download URL returned on completion

---

## 📁 Project Structure

    video-studio/
    ├── backend/
    │   ├── main.py                   # Entry point
    │   └── app/
    │       ├── config.py             # Env vars and feature flags
    │       ├── routes/               # One file per feature
    │       ├── services/             # Business logic and processing
    │       ├── models/               # Model loader and registry
    │       └── utils/                # Shared helpers
    │
    ├── frontend/
    │   └── src/
    │       ├── features/             # bgRemoval/ eyeContact/
    │       ├── components/           # Shared UI components
    │       ├── pages/                # Route-level pages
    │       ├── hooks/                # Custom React hooks
    │       ├── api/                  # Backend API client
    │       └── store/                # Global state Zustand
    │
    ├── ml_models/                    # gitignored
    │   ├── bg_removal/
    │   └── eye_contact/
    │
    ├── kaggle_notebooks/
    └── temp/                         # Runtime only gitignored

---

## 🔧 Feature Flags

Features are toggled via .env — no code changes needed:

    FEATURE_BG_REMOVAL=true
    FEATURE_EYE_CONTACT=false

---

## 🧠 ML Model Weights

Weights are not committed to git. They are either auto-downloaded or trained on Kaggle.

| Model | Source | Location |
|-------|--------|----------|
| U2Net bg removal | Auto-downloaded on first run | ~/.u2net/ |
| Eye contact | Train via Kaggle notebook export ONNX | ml_models/eye_contact/ |

See kaggle_notebooks/README.md for training instructions.

<!-- ---

## 📸 Screenshots

| | |
|:---:|:---|
| <img src="docs/screenshots/upload.png" width="300"/> | Upload — Drag or select your video |
| <img src="docs/screenshots/processing.png" width="300"/> | Processing — Real-time progress bar |
| <img src="docs/screenshots/result.png" width="300"/> | Result — Preview and download |

--- -->

## 🛠️ Development

### Useful Commands

    make dev-backend     # Start FastAPI with hot reload
    make dev-frontend    # Start Vite dev server
    make clean           # Purge temp files

### Adding a New Feature

1. Add route       -->  backend/app/routes/your_feature.py
2. Add service     -->  backend/app/services/your_feature_service.py
3. Register model  -->  backend/app/models/registry.py
4. Add flag        -->  .env and config.py
5. Register route  -->  backend/main.py
6. Add UI          -->  frontend/src/features/yourFeature/

---

## 🗺️ Roadmap

- [x] Project architecture and GitHub setup
- [x] Background removal — backend pipeline
- [x] Background removal — web UI
- [ ] Eye contact correction — Kaggle training notebook
- [ ] Eye contact correction — smart correction skip downward gaze
- [ ] Eye contact correction — web UI
- [ ] Android tablet optimised layout
- [ ] ONNX Runtime optimisation for faster CPU inference

---

## 🤝 Contributing

Contributions that improve the architecture or documentation are welcome.

1. Fork the repository
2. Create a branch:  git checkout -b feature/your-description
3. Commit with conventional commits:  feat:  fix:  docs:  refactor:
4. Open a Pull Request

### Welcome contributions

| Type | Example |
|------|---------|
| 🐛 Bug fixes | ONNX loading on Windows |
| 📚 Docs | Better Kaggle notebook guide |
| 🔧 Refactors | Cleaner model registry pattern |
| 🎨 UI/UX | Tablet-optimized layout |

### Will not merge

- Cloud-native rewrites — defeats local-first purpose
- GPU runtime requirements — must run on Mac CPU
- General-purpose model weights — personal tool by design

---

## 📝 Personal Note

Built for my own workflow — recording courses, removing backgrounds, fixing eye contact on a MacBook without expensive cloud tools.
The eye contact model is trained on my own footage.
Open-sourced in case the architecture is useful to others building personal AI tools.

---

## 📜 License

MIT — free to use, modify, and train your own models.

---

## 🙏 Acknowledgments

- U2Net  https://github.com/xuebinqin/U-2-Net
- rembg  https://github.com/danielgatis/rembg
- ONNX Runtime  https://onnxruntime.ai

---

Star this repo if you found it helpful!
https://github.com/neelkantnewra/video-studio