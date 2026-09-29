import os
import time
import json
import uuid
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import uvicorn

from services.contour_parser import parse_contour_file
from services.terrain_analysis import build_terrain_model
from services.pond_site_selection import select_pond_site
from services.catchment_analysis import delineate_catchment
from db import get_collection

app = FastAPI(
    title="Pond Catchment Analysis API",
    description="Topographic intelligence & hydrological GIS analysis for optimal village pond siting",
    version="3.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VolumeRecalcRequest(BaseModel):
    areaSquareMeters: float
    rainfallMm: float = 100.0
    runoffCoefficient: float = 0.70


def calculate_water_volume(area_m2: float, rainfall_mm: float, runoff_coeff: float) -> dict:
    """
    Standard Hydrological Runoff / Water Harvesting Formula:
      Volume (m³) = Catchment Area (m²) × Rainfall Depth (m) × Runoff Coefficient (C)
    """
    rainfall_m = rainfall_mm / 1000.0
    vol_m3 = round(area_m2 * rainfall_m * runoff_coeff, 2)
    vol_liters = round(vol_m3 * 1000.0, 2)
    vol_acre_feet = round(vol_m3 / 1233.48, 4)

    return {
        "expectedVolumeM3": vol_m3,
        "expectedVolumeLiters": vol_liters,
        "expectedVolumeAcreFeet": vol_acre_feet,
        "rainfallMm": rainfall_mm,
        "runoffCoefficient": runoff_coeff,
        "formula": "V = Catchment Area (m²) × Rainfall Depth (m) × Runoff Coefficient (C)",
        "assumptions": f"Rainfall: {rainfall_mm} mm | Soil Runoff Coefficient: {runoff_coeff} (clay/loam pond basin)"
    }


@app.get("/api/health")
def health_check():
    col = get_collection()
    db_status = "connected" if col is not None else "disconnected"
    return {
        "success": True,
        "status": "healthy",
        "phase": "Phase 3 – Interactive GIS Dashboard",
        "timestamp": datetime.utcnow().isoformat(),
        "database": db_status
    }


@app.post("/api/analyze-contour")
async def analyze_contour(
    contour_map: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    selected_area: Optional[str] = Form(None),
    rainfall_mm: float = Form(100.0),
    runoff_coeff: float = Form(0.70),
    max_candidates: Optional[int] = Form(None)
):
    upload = contour_map or file
    if not upload or not upload.filename:
        raise HTTPException(status_code=400, detail="No contour map file uploaded (expected .kml or .kmz)")

    ext = upload.filename.lower().split(".")[-1]
    if ext not in ["kml", "kmz"]:
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a .kml or .kmz contour file")

    start_time = time.time()
    file_bytes = await upload.read()

    try:
        # Step 1: Parse KML/KMZ
        parsed = parse_contour_file(file_bytes, upload.filename)
        features = parsed["features"]
        metadata = parsed["metadata"]

        # Parse optional selected area JSON if passed
        parsed_area = None
        if selected_area:
            try:
                parsed_area = json.loads(selected_area)
            except Exception:
                pass

        # Step 2: Build Terrain Model
        terrain_model = build_terrain_model(features, metadata, target_cell_count=35)

        # Step 3: Select Pond Site (constrained to selected_area if supplied)
        site_result = select_pond_site(
            terrain_model, metadata,
            selected_area=parsed_area,
            max_candidates=max_candidates
        )
        selected_site = site_result["selected"]
        candidates = site_result["candidates"]

        # Step 4: Delineate Catchment for selected optimal site
        catchment = delineate_catchment(terrain_model, selected_site)

        # Step 5: Calculate Expected Water Volume
        catchment_area_m2 = catchment.get("areaSquareMeters", 0.0)
        water_volume = calculate_water_volume(catchment_area_m2, rainfall_mm, runoff_coeff)
        selected_site["waterVolume"] = water_volume
        selected_site["expectedVolumeM3"] = water_volume["expectedVolumeM3"]

        # Calculate water volume and catchment area for every candidate
        cell_area = (terrain_model["cellSizeMeters"]) ** 2
        for cand in candidates:
            if cand.get("rank") == 1:
                cand["waterVolume"] = water_volume
                cand["expectedVolumeM3"] = water_volume["expectedVolumeM3"]
                cand["catchmentAreaM2"] = catchment_area_m2
                cand["catchmentAreaHectares"] = round(catchment_area_m2 / 10000.0, 2)
            else:
                c_area = max(cand.get("estimatedCatchmentM2", 100.0), float(cand.get("flowAccumulation", 1)) * cell_area)
                c_vol = calculate_water_volume(c_area, rainfall_mm, runoff_coeff)
                cand["waterVolume"] = c_vol
                cand["expectedVolumeM3"] = c_vol["expectedVolumeM3"]
                cand["catchmentAreaM2"] = round(c_area, 2)
                cand["catchmentAreaHectares"] = round(c_area / 10000.0, 2)

        processing_time_ms = int((time.time() - start_time) * 1000)

        # Format GeoJSON contours (sample up to 200 lines if too dense for fast browser rendering)
        sampled_contours = features if len(features) <= 200 else features[::max(1, len(features) // 200)]
        contour_geojson = {
            "type": "FeatureCollection",
            "features": sampled_contours
        }

        # Format Response
        analysis_data = {
            "analysisId": str(uuid.uuid4()),
            "filename": upload.filename,
            "createdAt": datetime.utcnow().isoformat(),
            "processingTimeMs": processing_time_ms,
            "metadata": metadata,
            "terrain": {
                "gridRows": terrain_model["nRows"],
                "gridCols": terrain_model["nCols"],
                "cellSizeMeters": round(terrain_model["cellSizeMeters"], 2),
                "bounds": terrain_model["bounds"],
                "minElevation": metadata.get("minElevation", 0),
                "maxElevation": metadata.get("maxElevation", 0),
                "contourCount": metadata.get("contourCount", len(features))
            },
            "pondSite": selected_site,
            "candidates": candidates,
            "catchment": catchment,
            "waterVolume": water_volume,
            "selectedArea": parsed_area,
            "contours": contour_geojson
        }

        # Persist to MongoDB Atlas if available
        col = get_collection()
        if col is not None:
            try:
                # Save summary to DB (without huge contour geojson for space efficiency)
                doc_to_save = dict(analysis_data)
                doc_to_save.pop("contours", None)
                col.insert_one(doc_to_save)
            except Exception as db_err:
                print(f"Failed to persist to MongoDB: {db_err}")

        return {
            "success": True,
            "message": "Topographic analysis completed successfully",
            **analysis_data
        }

    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        print(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.post("/api/recalculate-volume")
def recalculate_volume(req: VolumeRecalcRequest):
    """Dynamically recalculate water volume for custom rainfall & runoff parameters."""
    return {
        "success": True,
        "waterVolume": calculate_water_volume(req.areaSquareMeters, req.rainfallMm, req.runoffCoefficient)
    }


@app.get("/api/analyses")
def get_analyses(limit: int = Query(25, ge=1, le=100)):
    col = get_collection()
    if col is None:
        return {"success": True, "count": 0, "analyses": []}

    try:
        cursor = col.find({}, {"_id": 0, "contours": 0}).sort("createdAt", -1).limit(limit)
        results = list(cursor)
        return {
            "success": True,
            "count": len(results),
            "analyses": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")


@app.get("/api/analyses/{analysis_id}")
def get_analysis_by_id(analysis_id: str):
    col = get_collection()
    if col is None:
        raise HTTPException(status_code=503, detail="Database not available")

    doc = col.find_one({"analysisId": analysis_id}, {"_id": 0, "contours": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Analysis record not found")

    return {
        "success": True,
        "analysis": doc
    }


# Static Frontend Hosting
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
