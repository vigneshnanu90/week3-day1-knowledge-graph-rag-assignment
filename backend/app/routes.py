from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.graph_rag import HybridGraphRAGEngine

router = APIRouter(prefix="/api", tags=["GraphRAG"])

# Lazy singleton initialization
_engine: HybridGraphRAGEngine | None = None


def get_engine() -> HybridGraphRAGEngine:
    global _engine
    if _engine is None:
        _engine = HybridGraphRAGEngine()
    return _engine


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=2, max_length=1000, description="User question about TN Govt schemes")


class SourceItem(BaseModel):
    title: str
    url: str


class SubgraphPayload(BaseModel):
    nodes: List[Dict[str, Any]]
    links: List[Dict[str, Any]]


class ChatResponse(BaseModel):
    answer: str
    generated_cypher: str
    matched_scheme_ids: List[str]
    sources: List[SourceItem]
    subgraph: SubgraphPayload


@router.get("/health")
def health_check():
    try:
        engine = get_engine()
        engine.driver.verify_connectivity()
        return {"status": "ok", "neo4j": "connected"}
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Neo4j connection failed: {exc}")


@router.get("/graph/initial", response_model=SubgraphPayload)
def get_initial_graph(limit: int = 80):
    """Return initial overview subgraph for the right-hand Graph Explorer pane."""
    try:
        engine = get_engine()
        return engine.fetch_subgraph_for_schemes(
            scheme_ids=[], limit=limit, allow_full_fallback=True
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/chat", response_model=ChatResponse)
def chat_with_graph(payload: ChatRequest):
    """Run Hybrid Vector + Text-to-Cypher GraphRAG and return answer + traversed subgraph."""
    try:
        engine = get_engine()
        result = engine.answer_question(payload.question)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"GraphRAG execution error: {exc}")