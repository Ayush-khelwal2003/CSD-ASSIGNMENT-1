# CSD Assignment 1 – Phase 2: Pond Catchment Analysis Backend

## Project Overview
This project provides a full-stack solution to analyze topographic contour maps (in KML/KMZ format), identify suitable LAND locations for a water catchment pond, and calculate the contributing catchment area dynamically without hard-coding any values. 

**Important:** The system does NOT simply select the lowest point on the map or place the pond directly on the strongest drainage channel (e.g., a river/stream bed). Instead, it uses a multi-factor suitability scoring system to find an ideal land location adjacent to drainage pathways that has excellent water-retention and upstream catchment potential.

## Features
- Parses arbitrary KML/KMZ files to extract contour geometries and elevation data.
- Constructs a Digital Elevation Model (DEM) via Triangulated Irregular Network (TIN) interpolation.
- Calculates D8 Flow Direction and Flow Accumulation to trace water movement.
- **Multi-candidate pond selection** with **drainage-channel avoidance**.
- **Suitability scoring** based on elevation, slope, local depression, terrain convergence, and catchment potential.
- **Configurable scoring weights** for tuning across different contour maps.
- **Catchment estimation using D8** flow routing (upstream trace) to delineate the exact upstream catchment polygon and calculate its area.
- Persists all analyses to MongoDB.
- Provides a responsive React frontend with interactive Leaflet map rendering.

## Technology Stack
- **Frontend**: React, Vite, Leaflet, React-Leaflet, Axios, Lucide React
- **Backend**: Node.js, Express.js, Multer, Morgan
- **Database**: MongoDB (Atlas), Mongoose
- **Geospatial Processing**: Turf.js, @xmldom/xmldom (XML parsing), adm-zip (KMZ extraction)

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
- A MongoDB cluster (e.g., MongoDB Atlas)

### 1. MongoDB Setup
This project uses MongoDB Atlas. 
1. Create a free cluster on MongoDB Atlas.
2. Obtain your connection string.
3. Replace `<username>` and `<password>` in your connection string.

### 2. Backend Setup
```bash
cd server
npm install
# Create a .env file based on .env.example
cp .env.example .env
# Edit .env and set MONGODB_URI to your Atlas connection string
npm run dev
```
The server will run on `http://localhost:5000`

### 3. Frontend Setup
```bash
cd client
npm install
npm run dev
```
The client will run on `http://localhost:5173` or `http://localhost:5174` (check the console output).

---

## API Documentation

### POST `/api/analyze-contour`
Analyzes a KML or KMZ contour map.

**Request Format:**
- `Content-Type`: `multipart/form-data`
- `Field`: `file` (the uploaded .kml or .kmz file)

**Exact curl Command (for testing):**
```bash
curl -X POST http://localhost:5000/api/analyze-contour -F "contour_map=@contours_1m.kml"
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
    "bounds": {
      "minLng": 81.2814044952393,
      "maxLng": 81.3126468658447,
      "minLat": 21.2398224433387,
      "maxLat": 21.2635806472203
    }
  },
  "pondSite": {
    "latitude": 21.261496837946193,
    "longitude": 81.28706717491153,
    "elevation": 274.34,
    "reason": "Land site selected: ~236m offset from the main drainage channel (avoids stream/river); natural depression (3.10m below surrounding terrain); low slope (suitable for pond construction); terrain convergence (100% of neighbors higher); upstream catchment contributing area (flow accumulation: 23); located in lower portion of terrain.",
    "suitabilityScore": 0.8991,
    "scoreBreakdown": {
      "elevation": 0.7631,
      "slope": 0.8417,
      "depression": 0.999,
      "convergence": 1,
      "catchment": 0.7338,
      "channelOffset": 1
    },
    "distanceToChannelMeters": 235.87
  },
  "catchment": {
    "areaSquareMeters": 40419.71,
    "areaHectares": 4.042,
    "areaSquareKilometers": 0.0404,
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
The pond site is **not** simply the lowest point on the map or the point with the absolute highest flow accumulation (which would incorrectly place it on a river). Instead, it uses a multi-factor suitability scoring system with explicit drainage-channel avoidance.

Cells are scored against the following configurable criteria:
- **Distance from drainage channel (Channel Offset Penalty)**: Strongly prefers land locations adequately offset from the main drainage system.
- **Local Depression**: Preference for natural "terrain bowls" (areas deeper than their 5x5 neighbors).
- **Slope**: Low gradient / flat areas suitable for construction.
- **Flow Accumulation**: Ensures there is sufficient upstream catchment potential without selecting the main riverbed.
- **Terrain Convergence**: The fraction of immediate neighboring cells that are higher.
- **Elevation**: Preference for lower relative terrain elevations overall.

Multiple candidates are evaluated, and the highest-scoring spatially distinct cell is chosen alongside backup candidate sites.

### 4. Catchment Estimation Methodology
Starting from the selected pond site (the "pour point"), a Breadth-First Search (BFS) operates backwards on the D8 flow direction grid. It aggregates all grid cells whose simulated runoff pathways ultimately arrive at the pond cell. These cells are converted into a unified GeoJSON polygon via a union operation, and the total geodesic surface area is calculated dynamically using Turf.js.

---

## Limitations
1. **Grid Resolution Constraints**: Converting continuous vector contours into a rasterized TIN grid inherently generalizes the terrain, meaning small-scale localized variations (e.g., culverts, narrow ditches) may be missed.
2. **D8 Algorithm Simplification**: The D8 flow direction assumes water only flows into one adjacent cell (steepest descent). In reality, distributary flow over flat areas disperses water in multiple directions, leading to minor inaccuracies in flat regions.
3. **Hydrological Assumptions**: The system strictly maps topography; it does not model soil infiltration rates, land cover impermeability, or evaporation.

---

## Deployment

### Backend Deployment on Render

1. **Create a new Web Service** on [Render](https://render.com).
2. **Connect your GitHub repository**: `Ayush-khelwal2003/CSD-ASSIGNMENT-1`
3. **Configure the service** with these exact settings:

| Setting          | Value                |
|------------------|----------------------|
| **Root Directory** | `server`           |
| **Build Command**  | `npm install`      |
| **Start Command**  | `node src/server.js` |

4. **Set Environment Variables** on Render:

| Variable       | Value                                      |
|----------------|--------------------------------------------|
| `PORT`         | (Render sets this automatically)            |
| `MONGODB_URI`  | Your MongoDB Atlas connection string        |
| `NODE_ENV`     | `production`                                |
| `CLIENT_URL`   | Your frontend URL (optional, defaults to `*`) |

5. **Deploy** — Render will run `npm install` and start the server automatically.

### API Routes (Available After Deployment)

| Method | Route                  | Description                          |
|--------|------------------------|--------------------------------------|
| GET    | `/api/health`          | Health check (server + DB status)    |
| POST   | `/api/analyze-contour` | Upload and analyze a KML/KMZ file    |
| GET    | `/api/analyses`        | List all previous analyses           |

### Frontend Deployment (Optional)

1. Deploy the `client/` directory as a **Static Site** on Render.
2. Set environment variable: `VITE_API_URL=<your-deployed-backend-url>/api`
3. Build command: `npm run build`, output directory: `dist`.

---

## GitHub Commands

```bash
git add .
git commit -m "Prepare backend for Render deployment"
git push origin main
```

