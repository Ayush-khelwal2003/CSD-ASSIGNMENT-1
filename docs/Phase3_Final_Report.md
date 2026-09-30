# Phase 3 Final Technical Report
## Pond Catchment Analysis - CSD Assignment 1

**Course:** Cloud Systems Design (CSD)
**Phase:** 3 - Interactive GIS Dashboard
**Deployment:** System 2, College LAN
**LAN URL:** http://10.1.75.51:5000
**GitHub:** https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1
**Date:** 2026-09-30

---

## 1. Executive Summary

Phase 3 delivers a complete interactive GIS web application for village pond site selection.
The system processes topographic KML/KMZ contour maps, applies D8 hydrological routing,
delineates upstream catchment basins, and estimates rainwater harvesting potential.
The application is deployed on System 2 and accessible from any college-network machine
at http://10.1.75.51:5000.

---

## 2. System Architecture

The application is a monolithic full-stack Python service:
- FastAPI serves both the REST API and the static HTML/JS frontend
- Uvicorn ASGI server bound to 0.0.0.0:5000
- Leaflet.js provides the interactive satellite map in the browser
- MongoDB Atlas optionally persists analysis records to the cloud

### Technology Stack

| Component       | Technology             |
|----------------|------------------------|
| Backend API     | FastAPI (Python 3)     |
| ASGI Server     | Uvicorn                |
| Frontend Map    | Leaflet.js 1.9.4       |
| Frontend UI     | HTML/CSS/JS (no build) |
| Database        | MongoDB Atlas (M0)     |
| KML Parsing     | lxml + zipfile         |
| Terrain Grid    | NumPy + SciPy          |
| Geometry        | Shapely + PyProj       |

---

## 3. Implementation Details

### 3.1 KML/KMZ Parsing (contour_parser.py)

Accepts .kml (plain XML) and .kmz (ZIP archive with doc.kml). Uses lxml to extract
Placemark LineString geometries with elevation metadata. Returns GeoJSON FeatureCollection
of contour lines with bounding box for map auto-centering.

### 3.2 Terrain Model Construction (terrain_analysis.py)

Contour coordinate/elevation samples are interpolated onto a regular 2D grid using
scipy.interpolate.griddata (linear interpolation with nearest-neighbor fallback).
Default target grid: approximately 35x35 cells.

### 3.3 D8 Flow Routing and Pond Site Selection (pond_site_selection.py)

1. Flow Direction: each cell routes water to the steepest of 8 neighboring cells
2. Flow Accumulation: upstream cell counts accumulated across the entire grid
3. Candidate Selection: high-accumulation cells with suitable local topography selected
4. Ranking: candidates scored by flow accumulation, elevation stability, edge distance
5. Area Filter: optional user-drawn polygon constrains candidate locations

### 3.4 Catchment Basin Delineation (catchment_analysis.py)

Traces all cells whose D8 flow paths eventually reach each candidate site.
The union of these cells forms the catchment polygon.
Area computed in square meters using PyProj geographic projection.

### 3.5 Water Volume Estimation

Formula: V (m3) = Catchment Area (m2) x Rainfall Depth (m) x Runoff Coefficient (C)
Defaults: Rainfall = 100 mm, Runoff Coefficient = 0.70 (clay/loam soil).
Results reported in m3, liters, and acre-feet.

### 3.6 Frontend: Single-Page GIS Dashboard (static/index.html)

- Esri World Imagery satellite base map via Leaflet.js
- Color-coded contour line overlay rendered as GeoJSON
- Custom SVG pond site markers with rank labels
- Best site highlighted with distinct marker style
- Semi-transparent catchment basin polygon overlay
- Leaflet draw tool for interactive area selection
- Dark glassmorphism UI theme with Inter/Outfit fonts
- Results panel displaying all numerical outputs

---

## 4. LAN Deployment

### Network Configuration

| Property     | Value                     |
|-------------|--------------------------|
| Host         | System 2                  |
| External IP  | 10.1.75.51                |
| Port         | 5000                      |
| Bind address | 0.0.0.0 (all interfaces)  |
| Protocol     | HTTP                      |
| Scope        | College LAN               |

### Running the Server

```bash
cd ~/CSD-ASSIGNMENT-1/python_server
source venv/bin/activate
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 5000 --workers 1 \
  > ~/CSD-ASSIGNMENT-1/server.log 2>&1 &
```

### Access URLs

| Endpoint    | URL                                  |
|------------|--------------------------------------|
| Application | http://10.1.75.51:5000              |
| Health      | http://10.1.75.51:5000/api/health   |
| Swagger     | http://10.1.75.51:5000/docs         |

---

## 5. API Endpoints

| Method | Endpoint                | Purpose                     |
|--------|------------------------|------------------------------|
| GET    | /api/health            | Liveness + DB status         |
| POST   | /api/parse-contours    | Parse KML/KMZ for map render |
| POST   | /api/analyze-contour   | Full analysis pipeline       |
| POST   | /api/recalculate-volume| Volume recalculation         |
| GET    | /api/analyses          | List stored analyses         |
| GET    | /api/analyses/{id}     | Get analysis by ID           |

---

## 6. Security

- .env excluded from git via .gitignore (credentials never committed)
- CORS: allow_origins=["*"] (appropriate for college LAN deployment)
- No external internet access configured or required

---

## 7. Phase Comparison

| Capability             | Ph1 | Ph2 | Ph3 |
|------------------------|-----|-----|-----|
| KML/KMZ parsing        |  Y  |  Y  |  Y  |
| Terrain grid           |  Y  |  Y  |  Y  |
| D8 flow routing        |  N  |  Y  |  Y  |
| Pond candidates        |  N  |  Y  |  Y  |
| Catchment delineation  |  N  |  N  |  Y  |
| Water volume           |  N  |  N  |  Y  |
| Interactive map UI     |  N  |  N  |  Y  |
| LAN deployment         |  N  |  N  |  Y  |

---

## 8. Conclusion

Phase 3 delivers a production-ready GIS web application accessible at http://10.1.75.51:5000
from any machine on the college network. The system integrates D8 hydrological routing,
catchment delineation, and water volume estimation with an interactive Leaflet.js dashboard.
All source code is version-controlled at https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1.
