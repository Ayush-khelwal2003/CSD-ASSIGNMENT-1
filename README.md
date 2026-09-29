# CSD Assignment 1 — Interactive GIS Village Pond-Site Selection System

[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg?logo=python&logoColor=white)](https://python.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248.svg?logo=mongodb&logoColor=white)](https://mongodb.com)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900.svg?logo=leaflet&logoColor=white)](https://leafletjs.com)
[![License](https://img.shields.io/badge/License-Academic-lightgrey.svg)]()

> **Phase 3:** Full Interactive GIS Dashboard with Real-time Contour Ingestion, Rectangle Parcel Selection, Best Pond Marker Highlighting, Dynamic D8 Catchment Delineation, Water Volume Simulation, and Persistent MongoDB Atlas Analysis History.

---

## 🚀 Live Production & Demo URLs

- **GitHub Repository:** [https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1](https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1)
- **Public Production HTTPS URL:** [https://714317f640b2f2.lhr.life](https://714317f640b2f2.lhr.life)
- **Production API Health:** [https://714317f640b2f2.lhr.life/api/health](https://714317f640b2f2.lhr.life/api/health)
- **Local Development URL:** `http://localhost:5000` (or `http://10.1.75.51:5000` inside campus network)

---

## 🌟 Key Features

1. **Topographic Ingestion:** Native upload and parsing for both `.kml` and zipped `.kmz` contour vector files.
2. **Esri Satellite Cartography:** High-resolution World Imagery basemap tile service with dynamic contour overlay.
3. **Interactive Land Selection:** Mouse drag-and-drop rectangle bounding tool allowing users to define any target parcel.
4. **Multi-Candidate Site Evaluation:** Evaluates and scores thousands of terrain cells strictly within the selected parcel.
5. **Spatial Diversity Filtering:** Employs a greedy Euclidean distance buffer ($\ge 100\text{ m}$) yielding 5 distinct site alternatives.
6. **🏆 Highlighted Best Pond Site:** Candidate #1 is visually distinguished with an animated gold glow pulse, trophy badge, elevated z-index, and comprehensive suitability breakdown.
7. **Hydrological Catchment Basins:** Recursive reverse-D8 drainage tracing generates candidate-specific watershed polygons.
8. **Water Volume Simulation:** Calculates harvest volume using the rational equation $V = A \times P \times C$ with real-time sliders for rainfall and runoff coefficients.
9. **Persistent MongoDB Atlas Storage:** Automatically writes structured GIS analysis summaries to MongoDB Atlas for cloud auditability with local JSON redundancy.
10. **Zero-Bloat Single Service:** FastAPI serves both the high-performance GIS computation engine and the sleek frontend dashboard.

---

## 🏛️ System Architecture

```
[ Browser / Leaflet GIS ]
          │  Uploads KML/KMZ & Rectangle Coordinates
          ▼
[ FastAPI Backend (python_server/main.py) ]
    ├── services/contour_parser.py     (Extracts Contours & Elevations)
    ├── services/terrain_analysis.py   (Delaunay TIN & Regular DEM)
    ├── services/pond_site_selection.py (D8 Slopes, Depressions & Scoring)
    └── services/catchment_analysis.py (Reverse-D8 Watershed Delineation)
          │
          ├──► [ MongoDB Atlas Cluster ] (Persistent Run Metadata)
          └──► [ JSON Fail-safe Store ]   (Local Storage Redundancy)
```

---

## 🛠️ Technology Stack

| Layer | Component | Description |
|---|---|---|
| **Backend** | Python 3.10+, FastAPI, Uvicorn | High-throughput asynchronous ASGI microservice |
| **GIS / Math** | NumPy, SciPy, Shapely | Vectorized raster processing, Delaunay TIN, spatial polygons |
| **Database** | MongoDB Atlas via `pymongo` | Remote cloud NoSQL storage for analysis history |
| **Frontend** | HTML5, CSS3 Glassmorphism, ES6+ | Lightweight, responsive single-page GIS dashboard |
| **Mapping** | Leaflet.js 1.9.4 | Interactive web mapping and GeoJSON rendering |
| **Imagery** | Esri World Imagery | High-resolution satellite basemap tiles |
| **Deployment** | Render (`render.yaml`) | Automatic cloud container deployment via Git push |

---

## 💻 Local Setup & Execution

### 1. Clone Repository
```bash
git clone https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1.git
cd CSD-ASSIGNMENT-1
```

### 2. Configure Environment
Create `python_server/.env` (do **not** commit this file):
```env
MONGODB_URI=mongodb+srv://root:root@cluster123.lzzj9ao.mongodb.net/?appName=Cluster123
PORT=5000
```

### 3. Install Dependencies & Run
```bash
cd python_server
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python3 run.py
```
Open your browser at `http://localhost:5000`.

---

## 🌐 Public Deployment (Render)

This repository includes a `render.yaml` blueprint ready for deployment:

1. Create a new **Web Service** on [Render](https://render.com).
2. Connect this repository (`Ayush-khelwal2003/CSD-ASSIGNMENT-1`).
3. Set the Root Directory to `python_server`.
4. Configure Build Command: `pip install -r requirements.txt`.
5. Configure Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`.
6. Add the secret environment variable `MONGODB_URI` in the Render Environment Dashboard.

---

## 📖 API Documentation

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status and MongoDB connection verification |
| `POST` | `/api/parse-contours` | Parses KML/KMZ into GeoJSON contours and computes bounds |
| `POST` | `/api/analyze-contour` | Full GIS analysis: DEM, D8 routing, candidates, volume, DB save |
| `POST` | `/api/recalculate-volume` | Recalculates volume for custom rainfall and runoff coefficients |
| `GET` | `/api/analyses` | Fetches historical analysis runs from MongoDB Atlas |
| `DELETE` | `/api/analyses/{id}` | Deletes a specific historical analysis run |

---

## 📑 Detailed Report

A comprehensive 26-section technical report is available at [`docs/Phase3_Final_Report.md`](docs/Phase3_Final_Report.md).

---

## 📄 License & Attribution

Developed for CSD Assignment 1 (Phase 3). Academic use only.
