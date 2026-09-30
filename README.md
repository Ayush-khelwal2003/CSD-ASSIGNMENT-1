# Pond Catchment Analysis – CSD Assignment 1

> **Phase 3 – Interactive GIS Dashboard for Village Pond Siting**
> A full-stack hydrological GIS platform ingesting topographic contour maps (KML/KMZ),
> computing D8 flow routing, delineating catchment basins, and recommending optimal
> pond locations with expected water harvest volumes.

## Project Overview

End-to-end GIS analysis pipeline for village pond site selection using topographic contour data.

| Phase | Description |
|-------|-------------|
| Phase 1 | KML/KMZ parsing, terrain model construction |
| Phase 2 | D8 hydrological routing, pond candidate ranking |
| Phase 3 | Interactive GIS dashboard, catchment delineation, water volume estimation |

## Features

- KML/KMZ contour file upload
- Satellite base map (Esri via Leaflet.js)
- Color-coded contour visualization
- Interactive land-area selection (draw polygon)
- Pond candidate generation and ranking
- Best pond site highlighting on map
- Catchment area delineation (D8 algorithm)
- Expected water volume calculation
- Live volume recalculation (adjust rainfall/runoff)
- Swagger API documentation at /docs

## LAN Access URL

The application runs on System 2 and is accessible from any college-network machine:

| Resource | URL |
|----------|-----|
| Main Application | http://10.1.75.51:5000 |
| Health Check | http://10.1.75.51:5000/api/health |
| API Documentation | http://10.1.75.51:5000/docs |

## System Architecture

```
College-Network Browser --> HTTP --> FastAPI Server (System 2: 10.1.75.51:5000)
                                          |
                           +--------------+----------------+
                           |              |                |
                    contour_parser  terrain_analysis  pond_site_selection
                           |              |                |
                    catchment_analysis    |          MongoDB Atlas
                                         |            (optional)
                                    static/index.html
                                    (Leaflet.js SPA)
```

## Dependencies

```
fastapi
uvicorn[standard]
pymongo
python-multipart
pydantic
lxml
numpy
scipy
shapely
pyproj
```

## Environment Configuration

Create `.env` in the project root (never committed to git):

```env
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/?appName=...
PORT=5000
```

## How to Run on System 2

### Start server
```bash
cd ~/CSD-ASSIGNMENT-1/python_server
source venv/bin/activate
python3 -m uvicorn main:app --host 0.0.0.0 --port 5000 --workers 1
```

### Run in background (persists after SSH session ends)
```bash
cd ~/CSD-ASSIGNMENT-1/python_server
source venv/bin/activate
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 5000 --workers 1 \
  > ~/CSD-ASSIGNMENT-1/server.log 2>&1 &
echo $! > ~/CSD-ASSIGNMENT-1/server.pid
```

### Stop server
```bash
kill $(cat ~/CSD-ASSIGNMENT-1/server.pid)
```

### Check logs
```bash
tail -f ~/CSD-ASSIGNMENT-1/server.log
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/health | Server health + DB status |
| POST | /api/parse-contours | Parse KML/KMZ, return contours |
| POST | /api/analyze-contour | Full analysis pipeline |
| POST | /api/recalculate-volume | Volume with custom params |
| GET | /api/analyses | List stored analyses |
| GET | /api/analyses/{id} | Get analysis by ID |

### Health Response Example
```json
{
  "success": true,
  "status": "healthy",
  "phase": "Phase 3 - Interactive GIS Dashboard",
  "timestamp": "2026-09-30T04:00:00.000000",
  "database": "connected"
}
```

## Demo Workflow

1. Open browser: http://10.1.75.51:5000
2. Upload KML/KMZ contour file
3. Map auto-zooms to area, shows satellite view + contour lines
4. (Optional) Draw selection polygon to restrict analysis zone
5. Click "Run Analysis"
6. Results appear: pond markers, best site highlighted, catchment polygon
7. View: catchment area (m2, hectares), water volume (m3, liters, acre-feet)
8. Adjust rainfall (mm) or runoff coefficient, click "Recalculate"

**Water Volume Formula:**
```
V (m3) = Catchment Area (m2) x Rainfall Depth (m) x Runoff Coefficient (C)
Default: 100 mm rainfall, C=0.70
```

## Project Structure

```
CSD-ASSIGNMENT-1/
├── python_server/
│   ├── main.py                    # FastAPI app + API routes
│   ├── db.py                      # MongoDB connection
│   ├── run.py                     # Server runner
│   ├── requirements.txt           # Python dependencies
│   ├── venv/                      # Python virtual env (not in git)
│   ├── services/
│   │   ├── contour_parser.py      # KML/KMZ parsing
│   │   ├── terrain_analysis.py    # Grid interpolation
│   │   ├── pond_site_selection.py # D8 flow + ranking
│   │   └── catchment_analysis.py  # Basin delineation
│   └── static/
│       └── index.html             # Leaflet.js single-page app
├── docs/
│   └── Phase3_Final_Report.md
├── Dockerfile
├── .gitignore                     # Excludes .env, venv, logs
└── README.md
```

## GitHub Repository

https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1
