# Phase 3 Final Technical Report
## Pond Catchment Analysis – CSD Assignment 1

**Course:** Cloud Systems Design (CSD)  
**Phase:** 3 – Interactive GIS Dashboard  
**Deployment Host:** System 2 (Container on College Lab Server)  
**Host LAN IP:** `10.1.75.51`  
**Container IP:** `172.17.0.79`  
**Host Port:** `5278`  
**Container Port:** `5000`  
**Final Verified LAN URL:** `http://10.1.75.51:5278`  
**GitHub Repository:** https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1  
**Date:** 2026-09-30  

---

## 1. Executive Summary

Phase 3 delivers a complete interactive GIS web application for village pond site selection. Topographic contour data in KML or KMZ format is processed through an automated hydrological modeling pipeline (2D terrain interpolation, D8 flow direction and accumulation routing, catchment basin delineation, and water yield calculation).

The system is deployed on System 2 within the college network, listening internally on `0.0.0.0:5000` and accessible from other college network machines at `http://10.1.75.51:5278` via the lab host's Docker port mapping.

---

## 2. System Architecture & LAN Deployment

### 2.1 Deployment Topology

System 2 is provisioned as a Docker container on the college lab server:
- **Physical Host IP:** `10.1.75.51` (College LAN interface)
- **Container IP:** `172.17.0.79` (Docker bridge `172.17.0.0/16`, Gateway `172.17.0.1`)
- **Port Mapping:**
  - `10.1.75.51:2278` $\rightarrow$ `172.17.0.79:22` (SSH Access)
  - `10.1.75.51:5278` $\rightarrow$ `172.17.0.79:5000` (FastAPI / Web Application)

```
College Network Client (e.g., 10.50.12.7)
          │
          │ HTTP Request to http://10.1.75.51:5278
          ▼
Lab Server Host (10.1.75.51)
          │ (Docker NAT / Port Forward 5278 -> 5000)
          ▼
System 2 Container (172.17.0.79)
          │
          ├── Uvicorn ASGI Server (0.0.0.0:5000)
          │    └── FastAPI Web Service (REST API + Static SPA)
          │
          ├── Leaflet.js Frontend (Served to Browser)
          └── Geospatial Computation Engine (NumPy, SciPy, Shapely, PyProj)
```

### 2.2 Host vs Container Port Forwarding Analysis

Inside the System 2 container, the application binds to `0.0.0.0:5000`. On the host server (`10.1.75.51`), port `5000` is not exposed, as the multi-tenant lab infrastructure assigns dedicated ports per container (`5278` for Web, `2278` for SSH). Because the container runs in an unprivileged user namespace without access to the host Docker daemon or root permissions on `172.17.0.1`, container processes cannot bind directly to host port `5000`. Exposing host port `5000` would require host administrator action (`iptables -t nat -A PREROUTING -p tcp -d 10.1.75.51 --dport 5000 -j DNAT --to-destination 172.17.0.79:5000`).

The application is fully reachable and operational on the college LAN via `http://10.1.75.51:5278`.

---

## 3. Hydrological & Geospatial Pipeline

### 3.1 Contour Ingestion (`contour_parser.py`)
- Accepts `.kml` (XML) or `.kmz` (ZIP compressed).
- Uses `lxml` to extract all `Placemark` elements with `LineString` geometries and parse elevation values.
- Computes the bounding box `[min_lon, min_lat, max_lon, max_lat]` and produces a GeoJSON `FeatureCollection`.

### 3.2 Terrain Model Construction (`terrain_analysis.py`)
- Discretizes contour coordinates and elevations into an irregular scatter array.
- Interpolates onto a regular 2D digital elevation model (DEM) grid using `scipy.interpolate.griddata` (linear interpolation with nearest-neighbor fallback).

### 3.3 D8 Hydrological Routing & Pond Siting (`pond_site_selection.py`)
- **Flow Direction:** For each DEM cell, calculates the steepest slope gradient across all 8 cardinal and intercardinal neighbors.
- **Flow Accumulation:** Propagates upstream cell counts downstream to identify natural concentration points and drainage sinks.
- **Candidate Filtering & Ranking:** Identifies sink cells with high accumulation and flat local terrain. Candidates are ranked based on accumulated flow, topological depression depth, and distance from boundary edges.
- **Boundary Restriction:** If a user defines an area boundary polygon via the Leaflet draw tool, candidates outside the polygon are pruned.

### 3.4 Catchment Delineation (`catchment_analysis.py`)
- Traces backward from the target pond site through the D8 flow direction matrix to delineate all contributing upstream cells.
- Converts cell clusters into a unified GeoJSON polygon using `shapely.ops.unary_union`.
- Projects coordinates into UTM via `pyproj` to calculate true geodesic area in square meters ($m^2$) and hectares.

### 3.5 Water Harvest Volume Estimation
Calculated using the standard hydrological rational method formula:
$$V = A \times P \times C$$
- $V$: Estimated water volume ($m^3$)
- $A$: Catchment area ($m^2$)
- $P$: Rainfall depth ($m$, default 100 mm = 0.10 m)
- $C$: Runoff coefficient (default 0.70 for clay/loam soils)

---

## 4. API Endpoints & Health Verification

| Method | Endpoint | Description | Status |
|--------|----------|-------------|--------|
| `GET` | `/api/health` | Server liveness & database status | Verified (`200 OK`) |
| `POST` | `/api/parse-contours` | Parse KML/KMZ and return GeoJSON | Verified (`200 OK`) |
| `POST` | `/api/analyze-contour` | End-to-end hydrological analysis | Verified (`200 OK`) |
| `POST` | `/api/recalculate-volume` | Live volume recalculation | Verified (`200 OK`) |
| `GET` | `/docs` | OpenAPI / Swagger interactive UI | Verified (`200 OK`) |

---

## 5. Verification & Testing Results

- **Localhost Test (inside container):** `curl http://127.0.0.1:5000/api/health` $\rightarrow$ `PASS (200 OK)`
- **College LAN Test (from remote college machine 10.50.12.7):**
  - `curl http://10.1.75.51:5278/` $\rightarrow$ `PASS (200 OK, Leaflet Dashboard served)`
  - `curl http://10.1.75.51:5278/api/health` $\rightarrow$ `PASS (200 OK)`
  - `POST /api/parse-contours` $\rightarrow$ `PASS (200 OK)`
- **Host Port 5000 Status:** Host port `5000` is closed on the host firewall/Docker proxy; traffic routes via host port `5278`.

---

## 6. Conclusion

The Pond Catchment Analysis system has been successfully verified on the college network. All major workflows—from contour upload, satellite map rendering, interactive land selection, D8 flow analysis, and catchment delineation to water yield estimation—function reliably at `http://10.1.75.51:5278`.
