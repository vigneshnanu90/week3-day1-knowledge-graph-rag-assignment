import os
from dotenv import load_dotenv
from langchain_neo4j import Neo4jGraph, Neo4jVector
from langchain_openai import OpenAIEmbeddings
from pydantic import SecretStr
from extractor import run_extraction

load_dotenv()

NEO4J_URI = os.getenv("NEO4J_URI")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def create_constraints(graph: Neo4jGraph):
    """Ensure uniqueness and fast lookup indexes before merging nodes."""
    constraints = [
        "CREATE CONSTRAINT dept_name_unique IF NOT EXISTS FOR (d:Department) REQUIRE d.name IS UNIQUE",
        "CREATE CONSTRAINT scheme_id_unique IF NOT EXISTS FOR (s:Scheme) REQUIRE s.scheme_id IS UNIQUE",
        "CREATE CONSTRAINT beneficiary_type_unique IF NOT EXISTS FOR (b:BeneficiaryGroup) REQUIRE b.name IS UNIQUE",
        "CREATE CONSTRAINT document_name_unique IF NOT EXISTS FOR (doc:Document) REQUIRE doc.name IS UNIQUE",
    ]
    for cypher in constraints:
        graph.query(cypher)
    print("[✓] Neo4j uniqueness constraints verified.")


def ingest_scheme_record(graph: Neo4jGraph, record: dict):
    """Merge a single extracted scheme and its connected nodes into Neo4j."""
    cypher = """
    MERGE (d:Department {name: $department_name})

    MERGE (s:Scheme {scheme_id: $scheme_id})
    SET s.title = $clean_title,
        s.description = $concise_description,
        s.source_url = $source_url

    MERGE (d)-[:ADMINISTERS]->(s)

    WITH s
    UNWIND $beneficiary_groups AS group_name
    MERGE (bg:BeneficiaryGroup {name: group_name})
    MERGE (s)-[:TARGETS]->(bg)

    WITH s
    UNWIND $required_documents AS doc_name
    MERGE (doc:Document {name: doc_name})
    MERGE (s)-[:REQUIRES_DOCUMENT]->(doc)

    WITH s
    UNWIND $benefits AS ben
    MERGE (b:Benefit {category: ben.category, detail: ben.detail})
    MERGE (s)-[:PROVIDES]->(b)

    WITH s
    UNWIND $eligibility_rules AS rule
    MERGE (e:EligibilityCriteria {rule_summary: rule.rule_summary})
    SET e.income_limit = rule.income_limit,
        e.land_or_age_criteria = rule.land_or_age_criteria
    MERGE (s)-[:HAS_CRITERIA]->(e)
    """
    graph.query(
        cypher,
        params={
            "scheme_id": record["scheme_id"],
            "clean_title": record["clean_title"],
            "concise_description": record["concise_description"],
            "source_url": record["source_url"],
            "department_name": record["department_name"],
            "beneficiary_groups": record.get("beneficiary_groups", []),
            "required_documents": record.get("required_documents", []),
            "benefits": record.get("benefits", []),
            "eligibility_rules": record.get("eligibility_rules", []),
        },
    )


def build_vector_index():
    """Attach OpenAI embeddings and a Neo4j vector index directly onto :Scheme nodes."""
    print("[*] Building Neo4j Vector Index on :Scheme nodes...")
    embeddings = OpenAIEmbeddings(
        model="text-embedding-3-small",
        api_key=SecretStr(OPENAI_API_KEY or ""),
    )

    Neo4jVector.from_existing_graph(
        embedding=embeddings,
        url=NEO4J_URI,
        username=NEO4J_USERNAME,
        password=NEO4J_PASSWORD,
        index_name="scheme_vector_index",
        node_label="Scheme",
        text_node_properties=["title", "description"],
        embedding_node_property="embedding",
    )
    print("[✓] Neo4j Vector Index 'scheme_vector_index' created and populated.")


def main():
    if not all([NEO4J_URI, NEO4J_PASSWORD, OPENAI_API_KEY]):
        raise EnvironmentError(
            "Missing NEO4J_URI, NEO4J_PASSWORD, or OPENAI_API_KEY in your .env file."
        )

    records = run_extraction(force_refresh=False)

    print(f"[*] Connecting to Neo4j AuraDB at {NEO4J_URI} ...")
    graph = Neo4jGraph(
        url=NEO4J_URI,
        username=NEO4J_USERNAME,
        password=NEO4J_PASSWORD,
    )

    create_constraints(graph)

    print(f"[*] Ingesting {len(records)} schemes into Neo4j AuraDB...")
    for idx, record in enumerate(records, start=1):
        ingest_scheme_record(graph, record)
        print(f"  [{idx}/{len(records)}] Merged: {record['clean_title'][:65]}")

    # Refresh schema cache so LangChain sees all new labels and relationships
    graph.refresh_schema()
    print("\n[*] Updated Neo4j Schema:")
    print(graph.schema)

    build_vector_index()
    print("\n[✓] Knowledge Graph + Vector Index ingestion complete!")


if __name__ == "__main__":
    main()