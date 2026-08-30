# CSD Assignment 1 – Phase 2: Pond Catchment Analysis Backend

## Project Overview
This project provides a full-stack solution to analyze topographic contour maps (in KML/KMZ format), identify suitable locations for a water catchment pond, and calculate the contributing catchment area dynamically without hard-coding any values.

## Features
- Parses arbitrary KML/KMZ files to extract contour geometries and elevation data.
- Constructs a Digital Elevation Model (DEM) via Triangulated Irregular Network (TIN) interpolation.
- Calculates D8 Flow Direction and Flow Accumulation to trace water movement.
- Autonomously selects the best pond candidate based on multi-criteria topographic characteristics (flow accumulation, local depression relief, terrain convergence).
- Delineates the exact upstream catchment polygon and calculates the area in square meters, hectares, and square kilometers.
- Persists all analyses to MongoDB.
- Provides a responsive React frontend with interactive Leaflet map rendering.

## Technology Stack
- **Frontend**: React, Vite, Leaflet, React-Leaflet
- **Backend**: Node.js, Express.js, Multer
- **Database**: MongoDB, Mongoose
- **Geospatial Processing**: Turf.js, xmldom (XML parsing), AdmZip (KMZ extraction)

## Architecture & Folder Structure
```text
CSD_assignment/
├── README.md               # This file
├── .gitignore
├── client/                 # React frontend
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── .env                # Contains VITE_API_URL
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── index.css       # Global styles (Dark Theme)
│       ├── services/
│       │   └── api.js      # Axios API wrapper
│       └── components/
│           ├── FileUpload.jsx
│           ├── MapView.jsx
│           └── ResultsPanel.jsx
└── server/                 # Express backend
    ├── package.json
    ├── .env                # Environment variables
    └── src/
        ├── app.js          # Express app configuration
        ├── server.js       # Entry point
        ├── controllers/
        │   └── analysisController.js
        ├── middleware/
        │   ├── errorHandler.js
        │   └── upload.js
        ├── models/
        │   └── Analysis.js # MongoDB schema
        ├── routes/
        │   └── analysisRoutes.js
        ├── services/
        │   ├── analysisService.js       # Orchestrator
        │   ├── catchmentAnalysis.js     # Upstream trace & area calc
        │   ├── contourParser.js         # KML/KMZ parsing
        │   ├── pondSiteSelection.js     # Multi-criteria pond selection
        │   └── terrainAnalysis.js       # TIN, DEM, and Flow routing
        └── utils/
            └── geometry.js              # Haversine, bounds, barycentric interpolation
```

## Installation

### Prerequisites
- Node.js v18+ 
- MongoDB (running locally on port 27017, or set `MONGODB_URI` to a cluster URL)

### 1. MongoDB Setup
Ensure MongoDB is running locally. No manual database creation is required; Mongoose will create `pond_catchment` automatically on first insert.

### 2. Backend Setup
```bash
cd server
npm install
# Create a .env file based on .env.example
cp .env.example .env
npm run dev
```
The server will run on `http://localhost:5000`

### 3. Frontend Setup
```bash
cd client
npm install
npm run dev
```
The client will run on `http://localhost:5173`

---

## API Documentation

### POST `/api/analyze-contour`
Analyzes a KML or KMZ contour map.

**Request Format:**
- `Content-Type`: `multipart/form-data`
- `Field`: `file` (the uploaded .kml or .kmz file)

**Exact curl Command (for testing):**
```bash
curl -X POST http://localhost:5000/api/analyze-contour -F "file=@contours_1m.kml"
```

**Example API Response (Generated dynamically from contours_1m.kml):**
```json
{
  "success": true,
  "input": {
    "filename": "contours_1m.kml",
    "format": "KML"
  },
  "terrain": {
    "minElevation": 267,
    "maxElevation": 298,
    "contourCount": 1355,
    "contourInterval": 1,
    "uniqueElevations": 32,
    "bounds": {
      "minLng": 81.2814044952393,
      "maxLng": 81.3126468658447,
      "minLat": 21.2398224433387,
      "maxLat": 21.2635806472203
    }
  },
  "pondSite": {
    "latitude": 21.24978094896917,
    "longitude": 81.29019141197207,
    "elevation": 267.11,
    "reason": "Selected based on: high drainage convergence (flow accumulation: 75); surrounded by higher terrain (100% of neighbors higher); local depression (2.96m below average neighbor elevation); located in lower portion of terrain"
  },
  "catchment": {
    "areaSquareMeters": 131812.87,
    "areaHectares": 13.1813,
    "areaSquareKilometers": 0.1318,
    "polygon": {
      "type": "Polygon",
      "coordinates": [ /* ... GeoJSON Polygon ... */ ]
    }
  }
}
```

### GET `/api/health`
Check if the server and database are running.

### GET `/api/analyses`
Get a list of previous analyses stored in MongoDB.

---

## Methodologies

### 1. KML/KMZ Processing Methodology
The parser extracts `<Placemark>` geometries. For `<LineString>` elements, it searches for elevation data in the `<name>`, `<description>`, `<ExtendedData>`, or coordinates. It filters non-numeric data and standardizes geometries into GeoJSON format.

### 2. Terrain Analysis Methodology
A grid (approx. ~40-50m cell size) is overlaid on the bounding box of the contour map. Points are sampled from the contours to build a Triangulated Irregular Network (TIN). Elevation for each cell is calculated using barycentric interpolation. D8 (Deterministic 8-Node) Flow Direction is then calculated, determining the steepest descent for each grid cell. Finally, Flow Accumulation is generated via a topological sort algorithm (highest to lowest elevation).

### 3. Pond Site Selection Methodology
The pond site is **not** simply the lowest point on the map. Instead, cells are scored against multiple criteria:
- **Drainage convergence:** High flow accumulation.
- **Topographic convergence:** High percentage of adjacent cells with higher elevations.
- **Local Relief:** Degree of concavity (how much lower the cell is compared to average neighbor elevation).
- **Position:** Preference for lower relative terrain elevations overall.
The highest scoring cell is returned alongside backup candidate sites.

### 4. Catchment Estimation Methodology
Starting from the selected pond site (the "pour point"), a Breadth-First Search (BFS) operates backwards on the D8 flow direction grid. It aggregates all grid cells whose simulated runoff pathways ultimately arrive at the pond cell. These cells are converted into a unified GeoJSON polygon via a union operation, and the total geodesic surface area is calculated dynamically using Turf.js.

---

## Limitations
1. **Grid Resolution Constraints**: Converting continuous vector contours into a rasterized TIN grid inherently generalizes the terrain, meaning small-scale localized variations (e.g., culverts, narrow ditches) may be missed.
2. **D8 Algorithm Simplification**: The D8 flow direction assumes water only flows into one adjacent cell (steepest descent). In reality, distributary flow over flat areas disperses water in multiple directions, leading to minor inaccuracies in flat regions.
3. **Hydrological Assumptions**: The system strictly maps topography; it does not model soil infiltration rates, land cover impermeability, or evaporation.

---

## Deployment & GitHub Instructions

### GitHub Commands
Ensure you do not commit `node_modules`, `.env`, or heavy raw data files unless required.
```bash
git init
git add .
git commit -m "Initial commit: Full-stack Pond Catchment Analysis"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

### Deployment Steps (e.g. Render / Railway)
1. **Database:** Deploy a MongoDB cluster using MongoDB Atlas (free tier) and obtain the Connection string.
2. **Backend:** 
   - Deploy the `server/` directory as a Node Web Service.
   - Set environment variables: `PORT=5000` and `MONGODB_URI=<your-atlas-uri>`.
   - Set start command to `node src/server.js`.
3. **Frontend:**
   - Deploy the `client/` directory as a Static Site.
   - Set environment variables: `VITE_API_URL=<your-deployed-backend-url>/api`.
   - Set build command to `npm run build` and output directory to `dist`.
# CSD-ASSIGNMENT-1
