import os
import pymongo
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
client = None
db = None
analyses_collection = None

if MONGODB_URI:
    try:
        client = pymongo.MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=8000,
            connectTimeoutMS=8000,
            socketTimeoutMS=8000
        )
        # Ping to verify actual connection
        client.admin.command('ping')
        # Get the DB from URI or fallback
        try:
            db = client.get_default_database()
        except Exception:
            db = client["CSD_As1"]
        if db is None:
            db = client["CSD_As1"]
        analyses_collection = db["analyses"]
        print(f"✅ MongoDB Atlas connected: {db.name}.{analyses_collection.name}")
    except Exception as e:
        print(f"⚠️ MongoDB Connection failed (using local fallback): {e}")
        client = None
        db = None
        analyses_collection = None
else:
    print("ℹ️ MONGODB_URI not set — using local JSON store only")

def get_collection():
    return analyses_collection
