from pathlib import Path

import cv2
import numpy as np
from ultralytics import YOLO

# Loaded once at import time — never re-instantiate per request.
_MODEL_CANDIDATES = [
    Path(__file__).resolve().parent.parent.parent / "yolov8n.pt",
    Path("yolov8n.pt"),
]
_model_path = next((p for p in _MODEL_CANDIDATES if p.exists()), _MODEL_CANDIDATES[-1])
model = YOLO(str(_model_path))

VEHICLE_CLASSES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
PERSON_CLASS = {0: "person"}
ALL_TRACKED_CLASSES = {**VEHICLE_CLASSES, **PERSON_CLASS}

# Daytime defaults (Ultralytics defaults) — used whenever frame is NOT dark
DAY_CONF = 0.25
DAY_IMGSZ = 640

# Night / low-light — gated by mean luminance; never applied to bright frames
NIGHT_BRIGHTNESS_THRESHOLD = 85  # mean 0–255
NIGHT_CONF = 0.10
NIGHT_IMGSZ = 960
NIGHT_MERGE_IOU = 0.45

# Night-only headlight/taillight blob pass (never used on daytime path)
# 225 was missing dim/distant headlights on Caltrans frames; ~185 (-18%) recovers them.
LIGHT_BLOB_THRESH = 185
LIGHT_BLOB_MIN_AREA = 4
LIGHT_BLOB_MAX_AREA = 220
# Compact oval headlights — reject tall posts/guardrails and wide road streaks
LIGHT_BLOB_MAX_ASPECT = 2.6
LIGHT_BLOB_MAX_TALL_RATIO = 1.75  # bh/bw — kills vertical guardrail/sign reflections
LIGHT_BLOB_MAX_WIDE_RATIO = 2.8  # bw/bh — kills thin horizontal glare streaks
LIGHT_BLOB_MIN_FILL = 0.32  # area/(bw*bh); low fill = sparse streak/noise
LIGHT_PAIR_MAX_DX = 62  # slightly looser for perspective at distance
LIGHT_PAIR_MIN_DX = 5
LIGHT_PAIR_MAX_DY = 12
LIGHT_PAIR_AREA_RATIO = 3.6
LIGHT_AI_OVERLAP_IOU = 0.30
LIGHT_SELF_NMS_IOU = 0.35
LIGHT_PAIR_CONF = 0.55
LIGHT_SINGLE_CONF = 0.35
LIGHT_BOX_PAD_X = 8
LIGHT_BOX_PAD_Y = 6
LIGHT_ROI_Y0 = 0.20
LIGHT_ROI_Y1 = 0.88
LIGHT_MAX_SINGLE_FRACTION = 0.45


def _luminance_mean(bgr: np.ndarray) -> float:
    """Average perceived brightness (0–255)."""
    return float(
        0.114 * bgr[:, :, 0].mean()
        + 0.587 * bgr[:, :, 1].mean()
        + 0.299 * bgr[:, :, 2].mean()
    )


def is_night_frame(bgr: np.ndarray) -> bool:
    return _luminance_mean(bgr) < NIGHT_BRIGHTNESS_THRESHOLD


def enhance_low_light(bgr: np.ndarray) -> np.ndarray:
    """
    Detector-only copy: CLAHE on L-channel + mild contrast/brightness lift.
    Helps vehicle silhouettes and headlight/taillight clusters in dark frames.
    """
    lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(4, 4))
    l2 = clahe.apply(l)
    enhanced = cv2.cvtColor(cv2.merge([l2, a, b]), cv2.COLOR_LAB2BGR)
    # Lift midtones without fully clipping headlight blooms
    return cv2.convertScaleAbs(enhanced, alpha=1.35, beta=18)


def _iou(a: list[float], b: list[float]) -> float:
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[2], b[2])
    y2 = min(a[3], b[3])
    inter = max(0.0, x2 - x1) * max(0.0, y2 - y1)
    if inter <= 0:
        return 0.0
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _merge_detections(primary: list[dict], secondary: list[dict], iou_thresh: float) -> list[dict]:
    """Keep higher-confidence box when two overlap; union the rest."""
    merged = sorted(primary + secondary, key=lambda d: d["confidence"], reverse=True)
    kept: list[dict] = []
    for det in merged:
        if any(
            d["class"] == det["class"] and _iou(d["bbox"], det["bbox"]) >= iou_thresh
            for d in kept
        ):
            continue
        kept.append(det)
    return kept


def _parse_results(results) -> dict:
    vehicle_count = 0
    person_count = 0
    detections = []
    for box in results.boxes:
        cls_id = int(box.cls[0])
        if cls_id in ALL_TRACKED_CLASSES:
            label = ALL_TRACKED_CLASSES[cls_id]
            if cls_id in VEHICLE_CLASSES:
                vehicle_count += 1
            elif cls_id in PERSON_CLASS:
                person_count += 1
            detections.append(
                {
                    "class": label,
                    "confidence": float(box.conf[0]),
                    "bbox": box.xyxy[0].tolist(),
                }
            )
    return {
        "vehicle_count": vehicle_count,
        "person_count": person_count,
        "detections": detections,
    }


def _run_yolo(image, *, conf: float, imgsz: int) -> dict:
    results = model(image, conf=conf, imgsz=imgsz, verbose=False)[0]
    return _parse_results(results)


def _bbox_center(bbox: list[float]) -> tuple[float, float]:
    return ((bbox[0] + bbox[2]) * 0.5, (bbox[1] + bbox[3]) * 0.5)


def _center_inside(bbox: list[float], container: list[float]) -> bool:
    cx, cy = _bbox_center(bbox)
    return container[0] <= cx <= container[2] and container[1] <= cy <= container[3]


def _clamp_bbox(x1: float, y1: float, x2: float, y2: float, w: int, h: int) -> list[float]:
    return [
        float(max(0, min(w - 1, x1))),
        float(max(0, min(h - 1, y1))),
        float(max(0, min(w - 1, x2))),
        float(max(0, min(h - 1, y2))),
    ]


def _light_blob_components(bgr: np.ndarray) -> list[dict]:
    """
    Night-only: threshold bright pixels and return filtered connected components.
    Tuned for small Caltrans JPEGs (~320×260) where headlights are tiny.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, LIGHT_BLOB_THRESH, 255, cv2.THRESH_BINARY)
    # Light open — drop 1px grain without erasing dim distant headlights
    kernel = np.ones((2, 2), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)

    n_labels, _labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    blobs: list[dict] = []
    h, w = gray.shape[:2]
    y_lo = int(h * LIGHT_ROI_Y0)
    y_hi = int(h * LIGHT_ROI_Y1)
    for i in range(1, n_labels):  # 0 = background
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < LIGHT_BLOB_MIN_AREA or area > LIGHT_BLOB_MAX_AREA:
            continue
        bw = int(stats[i, cv2.CC_STAT_WIDTH])
        bh = int(stats[i, cv2.CC_STAT_HEIGHT])
        if bw < 1 or bh < 1:
            continue
        aspect = max(bw, bh) / max(1, min(bw, bh))
        if aspect > LIGHT_BLOB_MAX_ASPECT:
            continue
        # Explicit tall/narrow (guardrail, sign post) and wide/thin (road streak) rejects
        if bh / max(1, bw) > LIGHT_BLOB_MAX_TALL_RATIO:
            continue
        if bw / max(1, bh) > LIGHT_BLOB_MAX_WIDE_RATIO:
            continue
        fill = area / float(bw * bh)
        if fill < LIGHT_BLOB_MIN_FILL:
            continue
        y0 = int(stats[i, cv2.CC_STAT_TOP])
        cy = float(centroids[i][1])
        if cy < y_lo or cy > y_hi:
            continue
        cx = float(centroids[i][0])
        x0 = int(stats[i, cv2.CC_STAT_LEFT])
        blobs.append(
            {
                "cx": cx,
                "cy": cy,
                "area": area,
                "x0": x0,
                "y0": y0,
                "bw": bw,
                "bh": bh,
                "fill": fill,
                "aspect": aspect,
                "bbox": _clamp_bbox(x0, y0, x0 + bw, y0 + bh, w, h),
            }
        )
    return blobs


def diagnose_light_blobs(bgr: np.ndarray) -> dict:
    """
    Night-blob diagnostics: raw connected components vs post-filter blobs.
    Used for tuning/verification — does not change detection behavior.
    """
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, LIGHT_BLOB_THRESH, 255, cv2.THRESH_BINARY)
    kernel = np.ones((2, 2), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    n_labels, _labels, stats, centroids = cv2.connectedComponentsWithStats(mask, connectivity=8)
    h, w = gray.shape[:2]
    y_lo = int(h * LIGHT_ROI_Y0)
    y_hi = int(h * LIGHT_ROI_Y1)
    raw = []
    for i in range(1, n_labels):
        area = int(stats[i, cv2.CC_STAT_AREA])
        bw = int(stats[i, cv2.CC_STAT_WIDTH])
        bh = int(stats[i, cv2.CC_STAT_HEIGHT])
        if bw < 1 or bh < 1:
            continue
        aspect = max(bw, bh) / max(1, min(bw, bh))
        fill = area / float(bw * bh)
        cx, cy = float(centroids[i][0]), float(centroids[i][1])
        reasons = []
        if area < LIGHT_BLOB_MIN_AREA:
            reasons.append("min_area")
        if area > LIGHT_BLOB_MAX_AREA:
            reasons.append("max_area")
        if aspect > LIGHT_BLOB_MAX_ASPECT:
            reasons.append("aspect")
        if bh / max(1, bw) > LIGHT_BLOB_MAX_TALL_RATIO:
            reasons.append("tall")
        if bw / max(1, bh) > LIGHT_BLOB_MAX_WIDE_RATIO:
            reasons.append("wide")
        if fill < LIGHT_BLOB_MIN_FILL:
            reasons.append("fill")
        if cy < y_lo or cy > y_hi:
            reasons.append("roi")
        raw.append(
            {
                "area": area,
                "bw": bw,
                "bh": bh,
                "aspect": round(aspect, 2),
                "fill": round(fill, 2),
                "cx": round(cx, 1),
                "cy": round(cy, 1),
                "kept": len(reasons) == 0,
                "reject": reasons,
            }
        )
    kept = _light_blob_components(bgr)
    dets = _pair_light_blobs(kept, w, h)
    return {
        "thresh": LIGHT_BLOB_THRESH,
        "raw_count": len(raw),
        "kept_count": len(kept),
        "vehicle_dets": len(dets),
        "raw": raw,
        "kept": [
            {
                "area": b["area"],
                "bw": b["bw"],
                "bh": b["bh"],
                "aspect": round(b["aspect"], 2),
                "fill": round(b["fill"], 2),
                "cx": round(b["cx"], 1),
                "cy": round(b["cy"], 1),
            }
            for b in kept
        ],
        "detections": [
            {
                "mode": d.get("light_mode"),
                "conf": d["confidence"],
                "bbox": [round(x, 1) for x in d["bbox"]],
            }
            for d in dets
        ],
    }


def _nms_light_detections(dets: list[dict]) -> list[dict]:
    """Drop overlapping light boxes; prefer pairs (higher conf) over singles."""
    ordered = sorted(dets, key=lambda d: d["confidence"], reverse=True)
    kept: list[dict] = []
    for det in ordered:
        if any(_iou(det["bbox"], k["bbox"]) >= LIGHT_SELF_NMS_IOU for k in kept):
            continue
        # Also drop if center falls inside an already-kept light box
        if any(_center_inside(det["bbox"], k["bbox"]) for k in kept):
            continue
        kept.append(det)
    return kept


def _pair_light_blobs(blobs: list[dict], frame_w: int, frame_h: int) -> list[dict]:
    """
    Pair horizontally-aligned similar blobs as one vehicle; leftover singles
    still count as probable vehicles at lower confidence.
    """
    unused = set(range(len(blobs)))
    detections: list[dict] = []

    # Prefer pairing larger blobs first (closer / brighter lights)
    order = sorted(unused, key=lambda i: blobs[i]["area"], reverse=True)
    for i in order:
        if i not in unused:
            continue
        bi = blobs[i]
        best_j = None
        best_score = None
        for j in list(unused):
            if j == i:
                continue
            bj = blobs[j]
            dx = abs(bi["cx"] - bj["cx"])
            dy = abs(bi["cy"] - bj["cy"])
            if dx < LIGHT_PAIR_MIN_DX or dx > LIGHT_PAIR_MAX_DX:
                continue
            if dy > LIGHT_PAIR_MAX_DY:
                continue
            area_ratio = max(bi["area"], bj["area"]) / max(1, min(bi["area"], bj["area"]))
            if area_ratio > LIGHT_PAIR_AREA_RATIO:
                continue
            score = dy + abs(bi["area"] - bj["area"]) * 0.05 + abs(dx - 18) * 0.1
            if best_score is None or score < best_score:
                best_score = score
                best_j = j

        if best_j is not None:
            bj = blobs[best_j]
            unused.discard(i)
            unused.discard(best_j)
            x1 = min(bi["x0"], bj["x0"]) - LIGHT_BOX_PAD_X
            y1 = min(bi["y0"], bj["y0"]) - LIGHT_BOX_PAD_Y
            x2 = max(bi["x0"] + bi["bw"], bj["x0"] + bj["bw"]) + LIGHT_BOX_PAD_X
            y2 = max(bi["y0"] + bi["bh"], bj["y0"] + bj["bh"]) + LIGHT_BOX_PAD_Y * 2
            detections.append(
                {
                    "class": "car",
                    "confidence": LIGHT_PAIR_CONF,
                    "bbox": _clamp_bbox(x1, y1, x2, y2, frame_w, frame_h),
                    "source": "light",
                    "light_mode": "pair",
                }
            )

    for i in sorted(unused):
        b = blobs[i]
        # Singles near the far left/right edge are often cut-off glare / poles
        if b["cx"] < 8 or b["cx"] > frame_w - 8:
            continue
        box_w = b["bw"] + 2 * LIGHT_BOX_PAD_X
        if box_w > frame_w * LIGHT_MAX_SINGLE_FRACTION:
            continue
        x1 = b["x0"] - LIGHT_BOX_PAD_X
        y1 = b["y0"] - LIGHT_BOX_PAD_Y
        x2 = b["x0"] + b["bw"] + LIGHT_BOX_PAD_X
        y2 = b["y0"] + b["bh"] + LIGHT_BOX_PAD_Y * 2
        detections.append(
            {
                "class": "car",
                "confidence": LIGHT_SINGLE_CONF,
                "bbox": _clamp_bbox(x1, y1, x2, y2, frame_w, frame_h),
                "source": "light",
                "light_mode": "single",
            }
        )
    return _nms_light_detections(detections)


def detect_night_light_blobs(bgr: np.ndarray) -> list[dict]:
    """Headlight/taillight blob vehicles — call only from the night branch."""
    h, w = bgr.shape[:2]
    blobs = _light_blob_components(bgr)
    return _pair_light_blobs(blobs, w, h)


def _merge_ai_with_light_blobs(ai_dets: list[dict], light_dets: list[dict]) -> list[dict]:
    """
    Additive night merge: keep all AI boxes; add light boxes that do not
    overlap an existing AI vehicle (IoU > threshold or center inside AI box).
    """
    ai_vehicles = [d for d in ai_dets if d["class"] in VEHICLE_CLASSES.values()]
    non_vehicles = [d for d in ai_dets if d["class"] not in VEHICLE_CLASSES.values()]
    kept_light: list[dict] = []
    for light in light_dets:
        overlaps = False
        for ai in ai_vehicles:
            if _iou(light["bbox"], ai["bbox"]) >= LIGHT_AI_OVERLAP_IOU:
                overlaps = True
                break
            if _center_inside(light["bbox"], ai["bbox"]) or _center_inside(ai["bbox"], light["bbox"]):
                overlaps = True
                break
        if not overlaps:
            kept_light.append(light)
    return non_vehicles + ai_vehicles + kept_light


def analyze_frame(image_path: str, *, low_light_assist: bool = False) -> dict:
    """
    Detect vehicles and people in one pass.

    When low_light_assist=True (Live Camera Demo):
    - If frame is dark: run YOLO on raw AND CLAHE-enhanced copies at a lower
      confidence threshold, then merge boxes (NMS). Original file on disk is
      never modified — UI still shows the natural camera JPEG.
    - If frame is bright: daytime path only (conf=0.25, no enhancement).
    """
    bgr = cv2.imread(image_path)
    if bgr is None:
        return _run_yolo(image_path, conf=DAY_CONF, imgsz=DAY_IMGSZ)

    brightness = _luminance_mean(bgr)
    night = bool(low_light_assist and brightness < NIGHT_BRIGHTNESS_THRESHOLD)

    if not night:
        # Daytime path — unchanged: no blob pass, same conf/imgsz as before.
        result = _run_yolo(bgr, conf=DAY_CONF, imgsz=DAY_IMGSZ)
        result["night_mode"] = False
        result["frame_brightness"] = round(brightness, 1)
        result["detect_conf"] = DAY_CONF
        return result

    raw = _run_yolo(bgr, conf=NIGHT_CONF, imgsz=NIGHT_IMGSZ)
    enhanced = _run_yolo(enhance_low_light(bgr), conf=NIGHT_CONF, imgsz=NIGHT_IMGSZ)
    ai_detections = _merge_detections(raw["detections"], enhanced["detections"], NIGHT_MERGE_IOU)
    # Additive night-only headlight/taillight blob pass
    light_detections = detect_night_light_blobs(bgr)
    detections = _merge_ai_with_light_blobs(ai_detections, light_detections)
    vehicle_count = sum(1 for d in detections if d["class"] in VEHICLE_CLASSES.values())
    person_count = sum(1 for d in detections if d["class"] == "person")
    return {
        "vehicle_count": vehicle_count,
        "person_count": person_count,
        "detections": detections,
        "night_mode": True,
        "frame_brightness": round(brightness, 1),
        "detect_conf": NIGHT_CONF,
        "light_blob_added": sum(1 for d in detections if d.get("source") == "light"),
    }


def count_vehicles(image_path: str) -> dict:
    """Junction-grid helper — vehicles only; daytime defaults (no night assist)."""
    result = analyze_frame(image_path, low_light_assist=False)
    vehicle_detections = [
        d for d in result["detections"] if d["class"] in VEHICLE_CLASSES.values()
    ]
    return {
        "vehicle_count": result["vehicle_count"],
        "detections": vehicle_detections,
    }
