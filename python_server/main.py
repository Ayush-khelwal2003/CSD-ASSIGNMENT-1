import os
import time
import uuid
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from services.contour_parser import parse_contour_file
from services.terrain_analysis import build_terrain_model
from services.pond_site_selection import select_pond_site
from services.catchment_analysis import delineate_catchment
from db import get_collection

app = FastAPI(title="Pond Catchment Analysis API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    col = get_collection()
    db_status = "connected" if col is not None else "disconnected"
    return {
        "success": True,
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "database": db_status
    }

@app.post("/api/analyze-contour")
async def analyze_contour(contour_map: UploadFile = File(...)):
    if not contour_map.filename:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    ext = contour_map.filename.lower().split(".")[-1]
    if ext not in ["kml", "kmz"]:
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload a .kml or .kmz file")

    start_time = time.time()
    file_bytes = await contour_map.read()

    try:
        # Step 1: Parse KML/KMZ
        parsed = parse_contour_file(file_bytes, contour_map.filename)
        features = parsed["features"]
        metadata = parsed["metadata"]

        # Step 2: Build Terrain Model
        terrain_model = build_terrain_model(features, metadata, target_cell_count=35)

        # Step 3: Select Pond Site
        site_result = select_pond_site(terrain_model, metadata)
        selected_site = site_result["selected"]
        candidates = site_result["candidates"]

        # Step 4: Delineate Catchment
        catchment = delineate_catchment(terrain_model, selected_site)

        processing_time_ms = int((time.time() - start_time) * 1000)

        # Format Response
        analysis_data = {
            "analysisId": str(uuid.uuid4()),
            "filename": contour_map.filename,
            "createdAt": datetime.utcnow().isoformat(),
            "processingTimeMs": processing_time_ms,
            "metadata": metadata,
            "terrain": {
                "gridRows": terrain_model["nRows"],
                "gridCols": terrain_model["nCols"],
                "cellSizeMeters": round(terrain_model["cellSizeMeters"], 2),
                "bounds": terrain_model["bounds"]
            },
            "pondSite": selected_site,
            "candidates": candidates,
            "catchment": catchment
        }

        # Persist to MongoDB if available
        col = get_collection()
        if col is not None:
            try:
                doc_to_save = dict(analysis_data)
                col.insert_one(doc_to_save)
            except Exception as db_err:
                print(f"Failed to persist to MongoDB: {db_err}")

        return {
            "success": True,
            "message": "Contour analysis completed successfully",
            **analysis_data
        }

    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        print(f"Analysis error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.get("/api/analyses")
def get_analyses(limit: int = Query(20, ge=1, le=100)):
    col = get_collection()
    if col is None:
        return {"success": True, "count": 0, "analyses": []}

    try:
        cursor = col.find({}, {"_id": 0}).sort("createdAt", -1).limit(limit)
        results = list(cursor)
        return {
            "success": True,
            "count": len(results),
            "analyses": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database query failed: {str(e)}")

if __name__ == "__main__":
    port = int(os.getenv("PORT", 5278))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
