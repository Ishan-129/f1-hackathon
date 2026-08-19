from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db import get_db, LapTimeModel, SessionModel
from app.models import LapTimeResponse
import pandas as pd
import io
from typing import List

router = APIRouter(prefix="/api/laps", tags=["Laps"])

@router.post("", response_model=List[LapTimeResponse], status_code=201)
def upload_laps_csv(
    session_id: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    # 1. Verify session exists
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail=f"Session with ID {session_id} not found.")

    # 2. Read and parse CSV
    try:
        contents = file.file.read()
        df = pd.read_csv(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV file: {str(e)}")

    # Normalize columns to lowercase & strip whitespace
    df.columns = [col.lower().strip() for col in df.columns]

    # Map necessary columns
    lap_col = next((c for c in ['lap', 'lap_number', 'lap_num'] if c in df.columns), None)
    time_col = next((c for c in ['time', 'lap_time', 'lap_time_seconds', 'seconds'] if c in df.columns), None)

    if not lap_col or not time_col:
        raise HTTPException(
            status_code=400,
            detail="CSV must contain 'lap' (or lap_number) and 'time' (or lap_time) columns."
        )

    # Optional sector columns
    s1_col = next((c for c in ['sector_1', 'sector_1_seconds', 's1'] if c in df.columns), None)
    s2_col = next((c for c in ['sector_2', 'sector_2_seconds', 's2'] if c in df.columns), None)
    s3_col = next((c for c in ['sector_3', 'sector_3_seconds', 's3'] if c in df.columns), None)

    # 3. Clear existing lap times for this session to prevent duplicates
    db.query(LapTimeModel).filter(LapTimeModel.session_id == session_id).delete()

    created_laps = []
    for _, row in df.iterrows():
        try:
            lap_num = int(row[lap_col])
            lap_time = float(row[time_col])
            
            # Default sectors to lap_time / 3 if missing
            s1 = float(row[s1_col]) if s1_col else lap_time / 3.0
            s2 = float(row[s2_col]) if s2_col else lap_time / 3.0
            s3 = float(row[s3_col]) if s3_col else lap_time / 3.0
            
            # optional is_valid column
            is_valid = True
            if 'is_valid' in df.columns:
                is_valid = bool(row['is_valid'])
                
            db_lap = LapTimeModel(
                session_id=session_id,
                lap_number=lap_num,
                lap_time_seconds=lap_time,
                sector_1_seconds=s1,
                sector_2_seconds=s2,
                sector_3_seconds=s3,
                is_valid=is_valid,
                timestamp=datetime.now(timezone.utc)
            )
            db.add(db_lap)
            created_laps.append(db_lap)
        except Exception as e:
            db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Error parsing row: lap={row.get(lap_col)}, time={row.get(time_col)}. Error: {str(e)}"
            )

    db.commit()

    # Refresh DB items
    for lap in created_laps:
        db.refresh(lap)

    return [
        LapTimeResponse(
            id=lap.id,
            session_id=lap.session_id,
            lap_number=lap.lap_number,
            lap_time_seconds=lap.lap_time_seconds,
            sector_1_seconds=lap.sector_1_seconds,
            sector_2_seconds=lap.sector_2_seconds,
            sector_3_seconds=lap.sector_3_seconds,
            is_valid=lap.is_valid,
            timestamp=lap.timestamp
        )
        for lap in created_laps
    ]
