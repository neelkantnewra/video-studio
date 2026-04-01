import uuid
import asyncio
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
import aiofiles

from app.config import settings
from app.services.bg_removal_service import remove_background_from_video

router = APIRouter()

# Simple in-memory job store
# Fine for single-user local app — no database needed
_jobs: dict = {}


@router.post("/process")
async def process_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Upload a video and start background removal.
    Returns a job_id to poll for status.
    """
    # Validate file type
    allowed = (".mp4", ".mov", ".avi", ".mkv")
    if not file.filename.lower().endswith(allowed):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported format. Allowed: {allowed}"
        )

    # Check file size
    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > settings.MAX_VIDEO_SIZE_MB:
        raise HTTPException(
            status_code=400,
            detail=f"File too large: {size_mb:.1f}MB. Max: {settings.MAX_VIDEO_SIZE_MB}MB"
        )

    # Create job
    job_id = str(uuid.uuid4())
    input_path = settings.UPLOAD_DIR / f"{job_id}_{file.filename}"
    output_path = settings.OUTPUT_DIR / f"{job_id}_nobg.mp4"

    # Save uploaded file
    async with aiofiles.open(input_path, "wb") as f:
        await f.write(contents)

    # Register job
    _jobs[job_id] = {
        "status": "queued",
        "progress": 0,
        "total": 0,
        "filename": file.filename,
        "output": None,
        "error": None,
    }

    # Run processing in background
    background_tasks.add_task(
        _run_job, job_id, input_path, output_path
    )

    print(f"[route] Job created: {job_id} for file: {file.filename}")
    return {"job_id": job_id, "status": "queued"}


@router.get("/status/{job_id}")
async def get_status(job_id: str):
    """
    Poll this endpoint to check job progress.
    Status values: queued → processing → done | error
    """
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/download/{job_id}")
async def download(job_id: str):
    """
    Download the processed video once status is 'done'.
    """
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != "done":
        raise HTTPException(status_code=400, detail=f"Job not ready. Status: {job['status']}")

    return FileResponse(
        path=job["output"],
        media_type="video/mp4",
        filename=f"nobg_{job['filename']}"
    )


async def _run_job(job_id: str, input_path: Path, output_path: Path):
    """
    Runs in background — processes video and updates job status.
    """
    _jobs[job_id]["status"] = "processing"

    def on_progress(current: int, total: int):
        _jobs[job_id]["progress"] = current
        _jobs[job_id]["total"] = total

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            remove_background_from_video,
            input_path,
            output_path,
            on_progress,
        )
        _jobs[job_id]["status"] = "done"
        _jobs[job_id]["output"] = str(output_path)
        print(f"[route] Job done: {job_id}")

    except Exception as e:
        _jobs[job_id]["status"] = "error"
        _jobs[job_id]["error"] = str(e)
        print(f"[route] Job failed: {job_id} → {e}")