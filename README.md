# Video Studio

A personal, self-hosted AI video editor that runs entirely on your local machine.
Upload a video, process it with AI, download the result — no cloud, no subscriptions, no data leaving your device.

Built to run on a MacBook (CPU only) and accessible from an Android tablet on the same network.

---

## Features

| Feature | Status | Model |
|---|---|---|
| Background removal | ✅ Ready | U2Net via `rembg` |
| Eye contact correction | 🔧 In progress | Custom, trained on Kaggle |

---

## How it works
```
Your video
    ↓
FastAPI backend  ←→  React web UI (browser / tablet)
    ↓
Frame-by-frame AI processing (CPU)
    ↓
Download processed video
```

Models are trained once on **Kaggle GPU**, weights are downloaded and stored locally.
All inference runs on your Mac CPU — no GPU needed at runtime.

---

## Tech stack

**Backend** — Python 3.11, FastAPI, OpenCV, rembg, ONNX Runtime  
**Frontend** — React 18, Vite, Tailwind CSS  
**ML Training** — Kaggle notebooks (T4 GPU), exported to ONNX  
**Target device** — MacBook 2017 (server) + Android tablet (client)

---

## Project structure
```
video-studio/
├── backend/                  # FastAPI server
│   ├── main.py               # Entry point
│   └── app/
│       ├── config.py         # Env vars & feature flags
│       ├── routes/           # One file per feature
│       ├── services/         # Business logic & processing
│       ├── models/           # Model loader & registry
│       └── utils/            # Shared helpers
│
├── frontend/                 # React web UI
│   └── src/
│       ├── features/         # bgRemoval/, eyeContact/
│       ├── components/       # Shared UI components
│       ├── pages/            # Route-level pages
│       ├── hooks/            # Custom React hooks
│       ├── api/              # Backend API client
│       └── store/            # Global state (Zustand)
│
├── ml_models/                # Model weights (gitignored)
│   ├── bg_removal/
│   └── eye_contact/
│
├── kaggle_notebooks/         # Training notebooks
└── temp/                     # Runtime only, gitignored
```

---

## Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- MacBook or any machine with 8GB+ RAM

### 1. Clone & configure
```bash
git clone https://github.com/your-username/video-studio.git
cd video-studio
cp .env.example .env
```

### 2. Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

> First run will download U2Net weights (~170MB) automatically to `~/.u2net/`

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.  
On your tablet, open **http://YOUR_MAC_IP:5173** on the same Wi-Fi network.

---

## Feature flags

Features are toggled via `.env` — no code changes needed:
```env
FEATURE_BG_REMOVAL=true
FEATURE_EYE_CONTACT=false     # enable once weights are ready
```

---

## ML model weights

Weights are **not committed to git**. They are either auto-downloaded or trained on Kaggle.

| Model | Source | Location after download |
|---|---|---|
| U2Net (bg removal) | Auto-downloaded on first run | `~/.u2net/` |
| Eye contact | Train via Kaggle notebook, export ONNX | `ml_models/eye_contact/` |

See `ml_models/README.md` for detailed instructions.  
See `kaggle_notebooks/README.md` to run training yourself.

---

## Adding a new feature

1. Add route → `backend/app/routes/your_feature.py`
2. Add service → `backend/app/services/your_feature_service.py`
3. Register model → `backend/app/models/registry.py`
4. Add feature flag → `.env` + `config.py`
5. Register route → `backend/main.py`
6. Add UI → `frontend/src/features/yourFeature/`

---

## Useful commands
```bash
# Start backend
make dev-backend

# Start frontend  
make dev-frontend

# Clean temp files
make clean
```

---

## Roadmap

- [x] Project architecture & GitHub setup
- [x] Background removal — backend pipeline
- [ ] Background removal — web UI
- [ ] Eye contact correction — Kaggle training notebook
- [ ] Eye contact correction — smart correction logic (skip downward gaze)
- [ ] Eye contact correction — web UI
- [ ] Android tablet optimised layout
- [ ] Performance: ONNX optimisation for faster CPU inference

---

## Personal project

This is a fully personalised tool — the eye contact model is trained on my own video footage.
Not intended as a general-purpose product.

---

## License

MIT
