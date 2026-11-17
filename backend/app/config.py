import os
from functools import lru_cache
from pathlib import Path
from dotenv import load_dotenv
from langchain_neo4j import Neo4jGraph
from neo4j import GraphDatabase

# Load .env from project root
ROOT_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ROOT_ENV_PATH)


class Settings:
    NEO4J_URI: str = os.getenv("NEO4J_URI", "")
    NEO4J_USERNAME: str = os.getenv("NEO4J_USERNAME", "neo4j")
    NEO4J_PASSWORD: str = os.getenv("NEO4J_PASSWORD", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    VECTOR_INDEX_NAME: str = "scheme_vector_index"

    def validate(self):
        missing = [
            key
            for key, val in {
                "NEO4J_URI": self.NEO4J_URI,
                "NEO4J_PASSWORD": self.NEO4J_PASSWORD,
                "OPENAI_API_KEY": self.OPENAI_API_KEY,
            }.items()
            if not val
        ]
        if missing:
            raise EnvironmentError(f"Missing required environment variables: {', '.join(missing)}")


settings = Settings()


@lru_cache(maxsize=1)
def get_neo4j_driver():
    settings.validate()
    return GraphDatabase.driver(
        settings.NEO4J_URI,
        auth=(settings.NEO4J_USERNAME, settings.NEO4J_PASSWORD),
    )


@lru_cache(maxsize=1)
def get_langchain_graph() -> Neo4jGraph:
    settings.validate()
    return Neo4jGraph(
        url=settings.NEO4J_URI,
        username=settings.NEO4J_USERNAME,
        password=settings.NEO4J_PASSWORD,
    )