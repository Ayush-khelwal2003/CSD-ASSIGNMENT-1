# Pond Catchment Analysis — Python FastAPI Backend

High-performance Python backend for KML/KMZ contour map ingestion, terrain analysis (DEM/D8), pond site selection, and catchment area delineation.

## 🚀 Setup & Execution Guide (SSH Server)

### 1. Install Dependencies locally / system-wide
```bash
pip install -r requirements.txt
# OR if pip --user is needed:
pip install --user -r requirements.txt
```

### 2. Configure Environment (Optional)
Create `.env` file if connecting to MongoDB Atlas:
```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
PORT=5000
```

### 3. Run Server in Background (`nohup`)
```bash
nohup python3 main.py > server.log 2>&1 &
```

Check logs:
```bash
cat server.log
```

---

## 📡 API Reference

### Health Check
```
GET /api/health
```

### Analyze Contour (Main Route)
```
POST /api/analyze-contour
```
- **Content-Type**: `multipart/form-data`
- **Field Name**: `contour_map` (accepts `.kml` or `.kmz`)

#### Example Curl:
```bash
curl -X POST http://<HOST_IP>:<PORT>/api/analyze-contour \
  -F "contour_map=@contour_map.kml"
```
