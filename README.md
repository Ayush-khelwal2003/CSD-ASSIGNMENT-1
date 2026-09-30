# Pond Catchment Analysis – CSD Assignment 1

> **Phase 3 – Interactive GIS Dashboard for Village Pond Siting**  
> A full-stack hydrological GIS platform ingesting topographic contour maps (KML/KMZ), computing D8 flow routing, delineating catchment basins, and recommending optimal pond locations with expected water harvest volumes.

---

## Project Overview

End-to-end GIS analysis pipeline for village pond site selection using topographic contour data.

| Phase | Description |
|-------|-------------|
| Phase 1 | KML/KMZ parsing, terrain model construction, grid interpolation |
| Phase 2 | D8 hydrological routing, flow accumulation, pond candidate ranking |
| Phase 3 | Interactive GIS dashboard, catchment delineation, water volume estimation |

---

## Features

- **KML/KMZ Upload:** Parse topographic contour LineStrings from `.kml` and `.kmz` archives
- **Satellite Map:** Interactive Esri World Imagery basemap via Leaflet.js
- **Contour Visualization:** Color-coded topographic contour lines overlaid on map
- **Interactive Land Area Selection:** Leaflet draw polygon tool to constrain candidate search
- **Pond Candidate Generation:** Automatic sink and high-accumulation candidate identification
- **Best Pond Highlighting:** Top-ranked pond site marked prominently with rank badges
- **Catchment Basin Delineation:** Upstream catchment area traced using D8 flow paths
- **Expected Water Volume:** Rainwater harvesting yield calculated in m³, liters, and acre-feet
- **Interactive Parameter Recalculation:** Live adjustment of rainfall depth and runoff coefficient
- **RESTful API & Swagger Docs:** FastAPI backend with interactive documentation at `/docs`

---

## LAN Access & Deployment Architecture

System 2 runs inside a dedicated Docker container on the college lab server host (`10.1.75.51`).

### Network & Port Mapping

| Layer | IP Address | Port | Protocol / Service |
|-------|------------|------|--------------------|
| **Host (College LAN)** | `10.1.75.51` | `5278` | HTTP (Web Application) |
| **Host (College LAN)** | `10.1.75.51` | `2278` | SSH (System 2 Container) |
| **Container (System 2)** | `172.17.0.79` | `5000` | FastAPI / Uvicorn Server |
| **Container (System 2)** | `172.17.0.79` | `22` | OpenSSH Server |

### Verified College-Network Access URLs

The application is deployed on System 2 and accessible from any machine on the college network:

| Resource | Verified LAN URL |
|----------|------------------|
| **Main Application** | `http://10.1.75.51:5278` |
| **Health Check API** | `http://10.1.75.51:5278/api/health` |
| **Swagger API Documentation** | `http://10.1.75.51:5278/docs` |
| **ReDoc API Documentation** | `http://10.1.75.51:5278/redoc` |

> **Host Port Architecture Note:** The host Docker configuration forwards external port `5278` to container port `5000` (`-p 5278:5000`), matching the lab per-seat allocation (`2278` for SSH, `5278` for Web). Exposing host port `5000` directly would require host-side administrator privileges (`iptables` DNAT or container restart with `-p 5000:5000`), which cannot be modified from within an unprivileged container.

---

## System Architecture

```
College LAN Client (e.g. 10.50.x.x)
          │
          │ HTTP Request to http://10.1.75.51:5278
          ▼
Lab Server Host (10.1.75.51) ──[Docker Port Forward 5278 -> 5000]──┐
                                                                   │
┌──────────────────────── System 2 Container (172.17.0.79) ────────┘
│
│  FastAPI Application (0.0.0.0:5000)
│   ├── Static Files: Leaflet.js Single-Page GIS Application
│   │
│   └── REST API Endpoints:
│        ├── /api/health
│        ├── /api/parse-contours    ──> services/contour_parser.py
│        ├── /api/analyze-contour   ──> services/terrain_analysis.py
│        │                               │ (scipy.interpolate.griddata)
│        │                               ▼
│        │                          services/pond_site_selection.py
│        │                               │ (D8 flow routing & ranking)
│        │                               ▼
│        │                          services/catchment_analysis.py
│        │                                 (upstream basin delineation)
│        └── /api/recalculate-volume
│
│  MongoDB Atlas (Optional cloud persistence)
└─────────────────────────────────────────────────────────────────
```

---

## Dependencies & Tech Stack

- **Backend:** Python 3, FastAPI, Uvicorn, Pydantic, python-multipart
- **Hydrological & Geospatial:** NumPy, SciPy, Shapely, PyProj, lxml
- **Frontend:** Leaflet.js 1.9.4, Leaflet Draw, Esri World Imagery Basemap
- **Database:** MongoDB Atlas (via PyMongo, optional)

---

## Environment Configuration

Create a `.env` file in the project root:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/?appName=...
```

---

## Running on System 2

### 1. Activate Environment & Run Foreground
```bash
cd ~/CSD-ASSIGNMENT-1/python_server
source venv/bin/activate
python3 -m uvicorn main:app --host 0.0.0.0 --port 5000
```

### 2. Run in Background (Persistent)
```bash
cd ~/CSD-ASSIGNMENT-1/python_server
source venv/bin/activate
nohup python3 -m uvicorn main:app --host 0.0.0.0 --port 5000 > ~/CSD-ASSIGNMENT-1/server.log 2>&1 &
echo $! > ~/CSD-ASSIGNMENT-1/server.pid
```

### 3. Check Server Status
```bash
curl http://127.0.0.1:5000/api/health
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Server liveness and database connection status |
| `POST` | `/api/parse-contours` | Parse uploaded KML/KMZ and return contour GeoJSON |
| `POST` | `/api/analyze-contour` | Full hydrological analysis: terrain, D8, pond candidates, catchment |
| `POST` | `/api/recalculate-volume` | Recalculate water volume for custom rainfall depth and runoff coefficient |
| `GET` | `/api/analyses` | List stored analyses |
| `GET` | `/api/analyses/{id}` | Retrieve specific analysis by ID |

### Health Check Response
```json
{
  "success": true,
  "status": "healthy",
  "phase": "Phase 3 – Interactive GIS Dashboard",
  "timestamp": "2026-09-30T04:55:07.221607",
  "database": "disconnected"
}
```

---

## Demo Workflow

1. Open any browser on the college network and navigate to:  
   **`http://10.1.75.51:5278`**
2. Upload a topographic contour file (`.kml` or `.kmz`).
3. The interactive map auto-zooms to the bounding box and renders contour lines colored by elevation.
4. *(Optional)* Use the polygon draw tool in the toolbar to specify a target land boundary.
5. Click **"Run Hydrological Analysis"**.
6. Review the generated pond candidates on the map:
   - Ranked pond candidate markers (R1, R2, R3...)
   - Best candidate highlighted with distinct gold halo marker
   - D8 upstream catchment basin overlay polygon
7. Inspect the numerical results panel:
   - Catchment area (m² and hectares)
   - Estimated rainwater harvest volume (m³, liters, acre-feet)
8. Adjust rainfall depth (mm) or runoff coefficient ($C$) and click **"Recalculate Volume"** for immediate live updates.

**Water Volume Formula:**
$$\text{Volume } (m^3) = \text{Catchment Area } (m^2) \times \text{Rainfall Depth } (m) \times C$$

---

## GitHub Repository

- **Repository:** https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1
