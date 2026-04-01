import os
import sys

# 1. Get the absolute path to the backend folder
backend_path = os.path.join(os.getcwd(), "backend")

# 2. Add it to the system path so Python can "see" the app folder
sys.path.append(backend_path)

# 3. Now you can import correctly
from app.services.video_service import process_video_background

# Define paths
INPUT_FILE = "tests/samples/input_test.mp4"
OUTPUT_FILE = "tests/samples/output_test.mp4"

if __name__ == "__main__":
    if not os.path.exists(INPUT_FILE):
        print(f"❌ Error: Could not find {INPUT_FILE}")
    else:
        print("🚀 Starting Background Removal Engine...")
        print("Note: This might take a few minutes on an Intel i5.")
        
        try:
            process_video_background(INPUT_FILE, OUTPUT_FILE)
            print(f"✅ Success! Output saved to: {OUTPUT_FILE}")
        except Exception as e:
            print(f"❌ Processing failed: {e}")