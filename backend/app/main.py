from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from app.db import Base, engine
from app.routers import session, audio, laps, insights

# Create tables in SQLite on start
Base.metadata.create_all(bind=engine)

# Ensure uploads directory exists on disk
os.makedirs("uploads", exist_ok=True)

app = FastAPI(title="PitPulse API", version="1.0.0")

# Mount static folder
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production/CORS safety
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(session.router)
app.include_router(audio.router)
app.include_router(laps.router)
app.include_router(insights.router)

@app.get("/")
def read_root():
    return {"message": "Welcome to PitPulse API"}
