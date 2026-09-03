# Computer Systems Design (CSD) — Assignment 1 (Phase 2 Report)
**Project Title**: Automated Pond Location Identification & Catchment Delineation API  
**GitHub Repository**: [https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1.git](https://github.com/Ayush-khelwal2003/CSD-ASSIGNMENT-1.git)  
**Working API Route URL**: `http://10.1.75.51:5278/api/analyze-contour`  

---

## 1. Executive Summary

This report documents the design, mathematical framework, and API implementation for automated terrain analysis, pond site selection, and catchment area delineation from uploaded KML/KMZ contour maps.

The solution provides a generalized, highly extensible, and high-performance backend (developed in Python FastAPI with Scipy vectorised spatial algorithms) capable of processing dense 1-meter resolution contour maps (1,300+ features) in **under 1 second** without hardcoded parameters or sample-specific assumptions.

---

## 2. API Specifications & Demonstration

### 2.1 Endpoint Summary

- **URL**: `http://10.1.75.51:5278/api/analyze-contour`
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Form Data Field**: `contour_map` (accepts `.kml` or `.kmz`)
- **Response Format**: `application/json`

---

### 2.2 API Documentation

#### Request Format
```http
POST /api/analyze-contour HTTP/1.1
Host: 10.1.75.51:5278
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="contour_map"; filename="contour_map.kml"
Content-Type: application/vnd.google-earth.kml+xml

<Binary KML/KMZ File Data>
------WebKitFormBoundary--
```

#### Response Fields Description
- `success`: Boolean status of request.
- `processingTimeMs`: Execution duration in milliseconds.
- `metadata`: Extracted map properties (contour count, elevation range, bounding box).
- `terrain`: Interpolated DEM grid dimensions and cell size in meters.
- `pondSite`: Selected optimal pond location (coordinates, elevation, suitability score breakdown).
- `candidates`: Ranked alternative land candidates.
- `catchment`: Delineated GeoJSON MultiPolygon geometry and calculated surface area (m², Hectares, km²).

---

### 2.3 Demonstration using Provided Sample Contour Map (`contour_map.kml`)

#### Sample cURL Request:
```bash
curl -X POST http://10.1.75.51:5278/api/analyze-contour \
  -F "contour_map=@contour_map.kml"
```

#### Truncated Sample JSON Response:
```json
{
  "success": true,
  "message": "Contour analysis completed successfully",
  "analysisId": "f6956fe5-4f4c-4022-9d33-c5924d3ee6c3",
  "filename": "contour_map.kml",
  "processingTimeMs": 875,
  "metadata": {
    "contourCount": 1355,
    "minElevation": 267.0,
    "maxElevation": 298.0,
    "uniqueElevations": 32,
    "contourInterval": 1.0,
    "bounds": {
      "minLng": 81.2814045,
      "maxLng": 81.3126468,
      "minLat": 21.2398224,
      "maxLat": 21.2635806
    }
  },
  "terrain": {
    "gridRows": 27,
    "gridCols": 35,
    "cellSizeMeters": 92.51
  },
  "pondSite": {
    "latitude": 21.25786108,
    "longitude": 81.29434776,
    "elevation": 279.09,
    "suitabilityScore": 0.8788,
    "flowAccumulation": 13,
    "distanceToChannelMeters": 724.15,
    "scoreBreakdown": {
      "elevation": 0.61,
      "slope": 0.7792,
      "depression": 1.0,
      "convergence": 1.0,
      "catchment": 0.7548,
      "channelOffset": 1.0
    },
    "reason": "Land site selected: ~724m offset from the main drainage channel (avoids stream/river); natural depression (3.47m below surrounding terrain); low slope (suitable for pond construction)..."
  },
  "catchment": {
    "polygon": {
      "type": "MultiPolygon",
      "coordinates": [...]
    },
    "areaSquareMeters": 117662.01,
    "areaHectares": 11.7662,
    "areaSquareKilometers": 0.1177
  }
}
```

---

## 3. Methodological Approach: Terrain Analysis & Catchment Estimation

The backend pipeline converts irregular 2D/3D vector contours into continuous hydrological models through a 5-stage algorithm:

```
[KML/KMZ File] 
     │
     ▼
[Stage 1: Multi-Source Elevation Parsing]
     │
     ▼
[Stage 2: Vectorised DEM Interpolation (LinearND / Scipy)]
     │
     ▼
[Stage 3: D8 Flow Direction & Topological Accumulation]
     │
     ▼
[Stage 4: Multi-Factor Land Site Suitability Scoring]
     │
     ▼
[Stage 5: Upstream Reverse-BFS Catchment Delineation & Geodesic Area]
```

### Stage 1: Robust Feature & Elevation Extraction
- Parses `.kml` XML structure or extracts `doc.kml` from `.kmz` ZIP archives.
- Dynamically resolves elevation values across diverse KML generator schema using priority fallback:
  1. `<name>` tag numerical values.
  2. `<ExtendedData>` / `<SimpleData>` schema (attributes: `elev`, `alt`, `contour`, `height`).
  3. `<description>` regex text pattern parsing.
  4. Coordinate 3D Z-component.

### Stage 2: Digital Elevation Model (DEM) Generation
- Computes spatial bounding box $(\text{minLng}, \text{maxLng}, \text{minLat}, \text{maxLat})$ and grid resolution.
- Samples points along contour lines and performs **Scipy LinearNDInterpolator** (TIN-equivalent triangulation) to build a continuous elevation grid $E(r, c)$.
- Out-of-bounds cells (convex hull boundary gaps) are automatically filled using nearest-neighbor interpolation.

### Stage 3: Hydrological Flow Modeling (D8 Algorithm)
- **D8 Flow Direction**: Determines the direction of steepest downhill descent for each cell across 8 neighboring directions (E, NE, N, NW, W, SW, S, SE):
  $$\text{drop}_d = \frac{E(r, c) - E(r+\Delta r_d, c+\Delta c_d)}{\text{distance}_d}$$
- **Flow Accumulation**: Performs topological ordering (sorting cells from highest to lowest elevation) to propagate water volume downstream, establishing stream network channels and drainage density.

### Stage 4: Multi-Factor Land Pond Selection
To ensure village ponds are built on usable **land adjacent to drainage** rather than directly inside active streams/rivers, candidate cells are evaluated using a multi-factor composite score:
$$\text{Score} = w_{\text{offset}} S_{\text{offset}} + w_{\text{depr}} S_{\text{depr}} + w_{\text{catch}} S_{\text{catch}} + w_{\text{slope}} S_{\text{slope}} + w_{\text{elev}} S_{\text{elev}} + w_{\text{conv}} S_{\text{conv}}$$

- **Channel Offset ($w=0.25$)**: Multi-source BFS computes distance to the main drainage channel. Penalises stream beds and rewards land offset ($>400\text{m}$).
- **Local Depression ($w=0.20$)**: Evaluates depth below local $7\times 7$ neighborhood average.
- **Upstream Catchment ($w=0.20$)**: Logarithmic scaling of contributing flow accumulation.
- **Slope ($w=0.15$)**: Flat terrain preferred for low construction costs.
- **Relative Elevation ($w=0.10$)**: Low-lying region preference.
- **Terrain Convergence ($w=0.10$)**: Percentage of surrounding higher neighbors.

### Stage 5: Catchment Delineation & Geodesic Measurement
- Starting at the selected pond site (pour point), a reverse Breadth-First Search (BFS) traces all upstream cells whose D8 flow path terminates at the pond.
- The grid cells are merged into a GeoJSON `Polygon`/`MultiPolygon` using Shapely geometry operations.
- Geodesic area is calculated on the WGS84 ellipsoid using the spherical excess formula to ensure exact metric output (Hectares and $\text{km}^2$).

---

## 4. Code Extensibility & Generalization to Future Phases

The implementation is strictly non-hardcoded and designed for generalized spatial maps:

1. **Dynamic Bounding & Cell Sizing**: Grid boundaries and cell dimensions ($\text{cellSizeMeters}$) automatically adjust to match any geographical extent or coordinate scale.
2. **Zero Coordinate Pre-assumptions**: Spatial scoring, channel thresholds, and elevation limits use percentiles and relative ratios rather than fixed geographic constants.
3. **Configurable Weight Vector**: The scoring matrix `WEIGHTS` can be tuned via environmental configuration to accommodate different climatic or geographic terrains in future phases.
4. **Database Persistence**: Automatic MongoDB Atlas integration dynamically archives analyses for downstream UI integration or time-series comparative planning.

---

## 5. System Health & Verification

The deployed server on `stu20_sys2` maintains persistent background execution via process manager:

- **Health Verification**: `GET http://10.1.75.51:5278/api/health`
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2026-09-01T17:54:19.102Z",
  "database": "connected"
}
```
