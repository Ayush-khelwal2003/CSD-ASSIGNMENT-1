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
        client = pymongo.MongoClient(MONGODB_URI, serverSelectionTimeoutMS=4000)
        try:
            db = client.get_default_database()
        except Exception:
            db = client["CSD_As1"]
        if db is None:
            db = client["CSD_As1"]
        analyses_collection = db["analyses"]
        print(f"✅ Initialized MongoDB Atlas collection: {analyses_collection.name}")
    except Exception as e:
        print(f"⚠️ MongoDB Connection warning: {e}")

def get_collection():
    return analyses_collection
