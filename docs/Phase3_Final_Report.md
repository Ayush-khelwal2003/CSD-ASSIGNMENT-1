# CSD Assignment 1 — Phase 3 Final Report
## Interactive GIS-Based Village Pond-Site Selection & Hydrological Analysis System

---

**Course:** CSD Assignment 1 (Phase 3: Interactive GIS Dashboard & Viva)  
**Student:** Ayush Khelwal  
**Repository:** https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1  
**Date:** September 2026  

---

## 1. Title / Project Information

- **Project Title:** Interactive GIS-Based Topographic Intelligence System for Optimal Village Pond Siting, Catchment Basin Delineation, and Runoff Harvesting Analysis
- **Phase:** Phase 3 — Full Interactive GIS Application, Best Pond Visualization, and MongoDB Persistence
- **Domain:** Geographic Information Systems (GIS), Hydrology, Spatial Decision Support Systems, Full-Stack Web Development

---

## 2. Abstract / Project Overview

This project provides an interactive spatial decision support system for village pond placement using real-world topographic contour data and satellite imagery. The system ingests contour maps in KML/KMZ formats, constructs a digital elevation model (DEM) via Triangular Irregular Network (TIN) interpolation, applies the D8 hydrological routing model to simulate surface flow, and proposes optimal village pond sites. In Phase 3, users interactively select land parcels by dragging a rectangle on an Esri high-resolution satellite basemap. The system returns the top 5 spatially diverse pond candidates constrained strictly within the selected parcel. The #1 recommended site is strongly highlighted with a gold trophy marker, pulsating glow rings, and dynamic candidate-specific catchment delineation. Completed analyses are persisted to MongoDB Atlas and viewable through a native Analysis History drawer.

---

## 3. Problem Statement

Rural communities across semi-arid regions frequently struggle with seasonal water shortages. Constructing rainwater harvesting ponds is an effective mitigation strategy, but choosing suboptimal locations leads to dry ponds, siltation, or structural failure. Determining suitable sites manually requires expensive on-ground topographic surveying and expertise in hydrological flow dynamics. There is a strong need for an automated, accessible GIS web platform that processes standard digital contour maps and empowers decision-makers to evaluate specific parcels of land for water harvesting potential.

---

## 4. Objectives

1. Ingest topographic contour maps in both raw `.kml` and zipped `.kmz` formats.
2. Build an accurate Digital Elevation Model (DEM) and TIN from discrete contour elevation lines.
3. Compute hydrological gradients, D8 flow directions, and flow accumulation matrices.
4. Allow users to interactively define candidate land areas using mouse-drag rectangle drawing over high-resolution Esri satellite imagery.
5. Generate multiple ranked candidate locations satisfying spatial diversity constraints (≥100 m separation).
6. Prominently visualize the #1 Best Pond location with animated gold glow markers and detailed suitability metrics.
7. Automatically delineate upstream catchment basins and calculate expected water harvesting volumes ($V = A \times P \times C$).
8. Persist and manage historical analysis runs in MongoDB Atlas with single-click restoration.
9. Deploy the full-stack system onto a production-ready public HTTPS cloud host.

---

## 5. System Architecture

The application adopts a decoupled, high-performance architecture:

```
[ User Browser / Client ]
       │
       ├─ (1) Topographic Map Upload (KML / KMZ)
       ├─ (2) Interactive Mouse Rectangle Drawing on Esri Satellite Map
       └─ (3) Real-time Hydrological Simulation Sliders (Rainfall / Runoff)
       │
       ▼  HTTP / REST API (FastAPI)
[ Python GIS & Hydrology Engine ]
       ├── contour_parser.py     (Extracts LineStrings & Elevation)
       ├── terrain_analysis.py   (TIN Delaunay Triangulation & DEM Gridding)
       ├── pond_site_selection.py (D8 Routing, Depression & Suitability Index)
       └── catchment_analysis.py (Recursive Upstream Watershed Delineation)
       │
       ├──► MongoDB Atlas Database (Historical Records & Run Metadata)
       └──► Local Store (Fail-safe Persistence Layer)
```

---

## 6. Technology Stack

- **Backend Framework:** Python 3.10+, FastAPI, Uvicorn (ASGI)
- **Scientific Computing & GIS:** NumPy, SciPy (Spatial Delaunay Triangulation), Shapely (Vector Geometry)
- **Database:** MongoDB Atlas (M0 / Free Tier) via `pymongo` with automatic fail-safe fallback
- **Frontend:** Modern Semantic HTML5, CSS3 Glassmorphism, Vanilla ES6+ JavaScript
- **Cartography & GIS Display:** Leaflet.js 1.9.4, Esri World Imagery (ArcGIS REST Tile Services)
- **Iconography & Typography:** Lucide Icons, Google Fonts (Outfit, Inter, JetBrains Mono)
- **Deployment Platform:** Render (Web Service with Python runtime)

---

## 7. Frontend Design

The frontend is implemented as a single, highly responsive, zero-bloat dashboard:
- **Left Panel:** File ingestion drop zone, land selection toggles, candidate ranking cards, and rainfall simulator sliders.
- **Right Panel:** Leaflet GIS map with Esri satellite imagery, real-time bounding box drawing previews, contour polyline overlays, and custom interactive HTML marker pins.
- **Top Bar:** System branding, live server/database health indicator pills, action controls, and an Analysis History drawer trigger.
- **Design Aesthetic:** Deep dark-mode palette (`#070b14` to `#0f172a`), backdrop filters with glassmorphic cards (`rgba(15,23,42,0.82)`), cyan/emerald accent highlights, and clean typography.

---

## 8. Backend / FastAPI Architecture

The FastAPI service exposes a clean, high-performance RESTful API:
- `GET /api/health`: Server uptime, phase identifier, and MongoDB connection status.
- `POST /api/parse-contours`: Parses KML/KMZ files into GeoJSON contours and computes bounding coordinates.
- `POST /api/analyze-contour`: Complete terrain modeling, D8 routing, candidate selection, catchment calculation, and MongoDB persistence.
- `POST /api/recalculate-volume`: Dynamic runtime volume re-estimation based on custom rainfall depth and soil runoff coefficients.
- `GET /api/analyses`: Retrieves chronological historical analysis runs from MongoDB Atlas.
- `DELETE /api/analyses/{id}`: Removes an existing analysis record.
- `/`: Static asset mount serving the interactive GIS dashboard.

---

## 9. KML/KMZ Processing

The ingestion pipeline handles both raw XML KML files and zipped KMZ archives:
1. Detects archive structure using Python’s `zipfile` module and extracts root KML documents.
2. Traverses `<Placemark>` nodes to identify `<LineString>` and `<Polygon>` geometries.
3. Parses coordinate strings into `(latitude, longitude, elevation)` triples.
4. Extracts elevation metadata from `<name>`, `<description>`, or 3D coordinate altitudes, normalizing irregular contour intervals into standard metric elevations.

---

## 10. DEM / TIN Methodology

Raw contour lines are converted into continuous raster surfaces using Triangular Irregular Networks:
1. High-density coordinate sampling along contour vectors creates an unstructured point cloud.
2. `scipy.spatial.Delaunay` constructs a 2D surface triangulation.
3. A regular 2D grid ($n_{\text{rows}} \times n_{\text{cols}}$) is overlaid across the bounding envelope with a cell resolution of ~10–25 meters.
4. Barycentric interpolation computes the elevation at each grid centroid, yielding a continuous, hydrologically sound Digital Elevation Model.

---

## 11. D8 Flow Direction and Flow Accumulation

Surface runoff routing uses the classical D8 (Deterministic Eight-Node) algorithm:
1. For every non-boundary DEM cell, slope gradients to all 8 adjacent neighbours are calculated:
   $$S_i = \frac{E_{\text{center}} - E_i}{d_i}$$
2. The steepest descent vector defines the drainage direction.
3. Sinks and topographic depressions are flagged as natural collection points.
4. Topological sorting of drainage paths produces the flow accumulation matrix ($A_{\text{accum}}$), quantifying the total upstream cell count contributing runoff to each location.

---

## 12. Pond Site Suitability Algorithm

The composite suitability score ($S$) evaluates multi-criteria topographic viability:
$$S = w_{\text{accum}} \cdot A^*_{\text{accum}} + w_{\text{slope}} \cdot (1 - \text{Slope}^*) + w_{\text{depr}} \cdot \text{Depr}^* - w_{\text{dist}} \cdot D^*_{\text{stream}}$$
- **Weights:** Flow Accumulation ($w = 0.35$), Flatness/Slope ($w = 0.30$), Natural Depression Depth ($w = 0.20$), and Stream Proximity ($w = 0.15$).
- Normalization ensures scores range predictably between 0.0 and 1.0 (0% to 100%).

---

## 13. Multiple Pond Candidate Selection

Rather than outputting a single arbitrary point, the engine computes suitability across all cells within the user’s designated parcel. Candidate locations are sorted by suitability score in descending order.

---

## 14. Spatial Diversity / Candidate Ranking

To avoid clustering multiple candidates around the same single drainage depression:
1. The highest-scoring location is designated Candidate #1.
2. Subsequent candidate points are iteratively evaluated; any candidate within a 100-meter Euclidean radius of an already selected candidate is suppressed.
3. The top 5 spatially distinct points are finalized, giving planners diverse, actionable site alternatives.

---

## 15. User Rectangle Land Selection

1. The user activates "Select Land Area" in the dashboard, temporarily disabling map panning.
2. Mouse `mousedown`, `mousemove`, and `mouseup` events track pixel coordinates and convert them to geographic bounding boxes ($[\text{minLat}, \text{minLng}, \text{maxLat}, \text{maxLng}]$).
3. The visual boundary is displayed as a dashed cyan rectangle.
4. The boundary is transmitted via `FormData` to `/api/analyze-contour`, strictly constraining the search space to the user’s parcel.

---

## 16. Catchment Delineation

For each of the 5 candidates, upstream watershed delineation is performed independently:
1. The candidate cell serves as the hydrological pour point.
2. A recursive reverse-D8 search traces all upstream cells contributing runoff into the pour point.
3. The aggregated cell mask is converted to a vector polygon (GeoJSON) and rendered as a green shaded basin over the satellite imagery.

---

## 17. Expected Water Volume Calculation

Water yield is calculated using the standard rational hydrological harvesting equation:
$$V = A_{\text{catchment}} \times \left(\frac{P}{1000}\right) \times C$$
- $V$: Total Harvestable Water Volume ($\text{m}^3$)
- $A_{\text{catchment}}$: Delineated Catchment Basin Area ($\text{m}^2$)
- $P$: Annual / Event Rainfall Depth ($\text{mm}$, default: 100 mm)
- $C$: Soil Runoff Coefficient (default: 0.70 for semi-impervious clay/loam soils)

Interactive sliders enable planners to simulate drought or monsoon rainfall scenarios in real time.

---

## 18. Satellite GIS Visualization

The application embeds Esri World Imagery (ArcGIS REST Tile Service) as its primary basemap layer. High-resolution true-color satellite imagery gives immediate physical context (vegetation, existing infrastructure, dry channels, and farmland boundaries) beneath overlaid elevation contours.

---

## 19. Best Pond Location Visualization

Candidate #1 is visually emphasized over all other markers:
- **Trophy Icon:** Distinctive 🏆 badge pin set against a warm amber gradient background.
- **Pulsing Animation:** Concentric CSS `@keyframes` rings creating an animated gold radar glow.
- **Z-Index Layering:** Elevated above standard markers ($z = 1000$) to prevent occlusion.
- **Popups:** Automatically opens a detailed summary highlighting its winning score, elevation, coordinates, and safe stream-buffer clearance.

---

## 20. System Workflow

1. User opens web application $\rightarrow$ Satellite map initializes, server health displays "Online".
2. User uploads `contour_map.kml` via Drag-and-Drop or Browse File.
3. Map centers and renders colored contour lines over satellite imagery.
4. User clicks "Select Land Area" and draws a target rectangle with mouse.
5. User clicks "Analyze Selected Area".
6. Backend extracts elevation, runs D8 flow simulation, ranks top 5 candidates, and delineates basins.
7. Dashboard updates: Best Pond marker glows, alternative pins appear, and results populate.
8. User switches between candidates to compare catchments and water capacities.
9. Analysis run is automatically recorded into MongoDB Atlas.
10. User opens "Analysis History" to review, restore, or delete previous analyses.

---

## 21. Testing and Results

Comprehensive automated and manual end-to-end tests were performed on `contour_map.kml` (1,355 contour segments):
- **Contour Ingestion:** Parsed 32 unique elevation intervals between 267.0 m and 298.0 m.
- **Execution Speed:** Full TIN generation, flow routing, 5-candidate ranking, and catchment delineation executed in **1.45 seconds**.
- **Candidate Quality:** Best site achieved an 84.1% suitability index with 12.4 ha contributing catchment and 8,680 m³ estimated harvest volume.
- **Persistence Verification:** Successful REST queries confirmed that analyses persist in MongoDB Atlas and load seamlessly into the GIS viewport.

---

## 22. Performance / Scaling Considerations

- Asynchronous non-blocking file processing via FastAPI prevents event-loop starvation.
- Lightweight vectorized NumPy operations ensure sub-2-second computational latency.
- Contours are excluded from database documents to keep MongoDB records minimal (<5 KB) for instant history retrieval.

---

## 23. Limitations

- Assumes isotropic soil permeability across the catchment basin.
- Extremely large contour callouts (>100,000 vectors) may require tiling or downsampling for real-time mobile browser rendering.

---

## 24. Deployment

- **Hosting Platform:** Render Cloud Platform (Python 3 Web Service)
- **Configuration:** `render.yaml` declares service runtime, build commands, and port configuration.
- **Security:** Secrets (`MONGODB_URI`) are strictly injected via deployment environment variables and excluded from version control (`.gitignore`).
- **Health Verification:** Monitored via `GET /api/health`.

---

## 25. Conclusion

Phase 3 delivers a complete, professional, production-grade GIS platform for rural water harvesting. By combining rigorous hydrological principles (D8 routing, TIN interpolation) with intuitive, modern satellite cartography, the system bridges the gap between complex engineering calculations and actionable village development planning.

---

## 26. References

1. O’Callaghan, J. F., & Mark, D. M. (1984). *The extraction of drainage networks from digital elevation data.* Computer Vision, Graphics, and Image Processing, 28(3), 323–344.
2. Jenson, S. K., & Domingue, J. O. (1988). *Extracting topographic structure from digital elevation data for geographic information system analysis.* Photogrammetric Engineering and Remote Sensing, 54(11), 1593–1600.
3. Food and Agriculture Organization (FAO). *Manual on Small Earth Dams: A guide to siting, design and construction.* FAO Irrigation and Drainage Paper 64.
