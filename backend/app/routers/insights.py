from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db import get_db, SessionModel, InsightModel
from app.models import SessionInsightsResponse, InsightDetail
from app.analytics import generate_session_insights

router = APIRouter(prefix="/api/session", tags=["Insights"])

@router.get("/{id}/insights", response_model=SessionInsightsResponse)
def get_session_insights(id: int, db: Session = Depends(get_db)):
    # 1. Verify session exists
    sess = db.query(SessionModel).filter(SessionModel.id == id).first()
    if not sess:
        raise HTTPException(status_code=404, detail=f"Session with ID {id} not found.")

    # 2. Generate insights content using correlation engine
    insights_data = generate_session_insights(id, db)
    
    # 3. Clear old insights for this session
    db.query(InsightModel).filter(InsightModel.session_id == id).delete()
    
    # 4. Save new insights to DB
    db_insights = []
    for ins in insights_data:
        db_ins = InsightModel(
            session_id=id,
            category=ins["category"],
            content=ins["content"],
            severity=ins["severity"],
            timestamp=datetime.now(timezone.utc)
        )
        db.add(db_ins)
        db_insights.append(db_ins)
        
    db.commit()
    
    # Refresh to populate database fields (such as ID)
    for db_ins in db_insights:
        db.refresh(db_ins)
        
    return SessionInsightsResponse(
        session_id=id,
        insights=[
            InsightDetail(
                id=ins.id,
                category=ins.category,
                content=ins.content,
                severity=ins.severity,
                timestamp=ins.timestamp
            )
            for ins in db_insights
        ]
    )
