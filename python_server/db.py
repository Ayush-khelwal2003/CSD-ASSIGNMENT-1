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
        client = pymongo.MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        db = client.get_database()
        analyses_collection = db["analyses"]
        print("✅ Connected to MongoDB Atlas")
    except Exception as e:
        print(f"⚠️ MongoDB Connection warning: {e}")

def get_collection():
    return analyses_collection
