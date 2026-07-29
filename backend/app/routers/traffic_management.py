from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Any
import os
import json

from app.services.vision import count_vehicles
from app.services.signal_logic import compute_signal_durations
from app.services.gemma import explain_traffic_management
from app.services.live_camera import get_live_camera_state

router = APIRouter(prefix="/api/traffic-management", tags=["traffic-management"])

# In-memory storage for junction states (in production, use database)
junction_states = {
    "silk_board": {"vehicle_count": 0, "detections": [], "image_path": None, "timestamp": None},
    "marathahalli": {"vehicle_count": 0, "detections": [], "image_path": None, "timestamp": None},
    "kr_puram": {"vehicle_count": 0, "detections": [], "image_path": None, "timestamp": None},
    "hebbal": {"vehicle_count": 0, "detections": [], "image_path": None, "timestamp": None},
    "tin_factory": {"vehicle_count": 0, "detections": [], "image_path": None, "timestamp": None},
    "mg_road": {"vehicle_count": 0, "detections": [], "image_path": None, "timestamp": None},
    "trinity_circle": {"vehicle_count": 0, "detections": [], "image_path": None, "timestamp": None},
    "sarjapur": {"vehicle_count": 0, "detections": [], "image_path": None, "timestamp": None},
    "electronic_city_toll": {"vehicle_count": 0, "detections": [], "image_path": None, "timestamp": None},
}

# Directory to store uploaded images
UPLOAD_DIR = "uploads/traffic_images"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/junction/{junction_id}/capture")
async def capture_junction_image(junction_id: str, image: UploadFile = File(...)):
    """
    Accept an uploaded image from a junction (live webcam or rotating stock photo),
    run vehicle detection, and store the results.
    """
    if junction_id not in junction_states:
        raise HTTPException(status_code=404, detail="Junction not found")
    
    # Save uploaded image
    timestamp = datetime.utcnow().isoformat()
    filename = f"{junction_id}_{timestamp.replace(':', '-')}.jpg"
    filepath = os.path.join(UPLOAD_DIR, filename)
    
    with open(filepath, "wb") as f:
        content = await image.read()
        f.write(content)
    
    # Run vehicle detection
    try:
        detection_result = count_vehicles(filepath)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")
    
    # Update junction state
    junction_states[junction_id] = {
        "vehicle_count": detection_result["vehicle_count"],
        "detections": detection_result["detections"],
        "image_path": filepath,
        "timestamp": timestamp,
    }
    
    return {
        "junction_id": junction_id,
        "vehicle_count": detection_result["vehicle_count"],
        "detections": detection_result["detections"],
        "timestamp": timestamp,
    }


@router.get("/live-state")
async def get_live_state():
    """
    Returns all junctions' current vehicle counts, computed signal durations,
    and Gemma's explanation text.
    """
    # Extract vehicle counts
    vehicle_counts = {
        j_id: state["vehicle_count"]
        for j_id, state in junction_states.items()
    }
    
    # Compute signal durations based on congestion
    signal_durations = compute_signal_durations(vehicle_counts)
    
    # Get Gemma explanation
    explanation = await explain_traffic_management(vehicle_counts, signal_durations)
    
    # Build full state response
    junction_details = {}
    for j_id, state in junction_states.items():
        junction_details[j_id] = {
            "vehicle_count": state["vehicle_count"],
            "detections": state["detections"],
            "red_light_duration": signal_durations.get(j_id, 30),
            "is_congested": state["vehicle_count"] >= 25,
            "timestamp": state["timestamp"],
            "image_path": state["image_path"],
        }
    
    return {
        "junctions": junction_details,
        "signal_durations": signal_durations,
        "explanation": explanation,
        "last_updated": datetime.utcnow().isoformat(),
    }


@router.get("/live-camera")
async def get_live_camera():
    """
    Returns the latest live public camera detection state, signal timing,
    and Gemma explanation. Updated continuously by the background fetch loop.
    """
    return get_live_camera_state()
