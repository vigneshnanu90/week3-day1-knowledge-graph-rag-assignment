import re
from typing import Any, Dict, List, Tuple, cast
from typing_extensions import LiteralString

from langchain_core.prompts import ChatPromptTemplate, PromptTemplate
from langchain_neo4j import GraphCypherQAChain, Neo4jVector
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import SecretStr

from app.config import get_langchain_graph, get_neo4j_driver, settings
from app.guardrails import validate_generated_cypher, validate_user_input

CYPHER_GENERATION_TEMPLATE = """Task: Generate a Cypher statement to query a Neo4j Knowledge Graph of Tamil Nadu Government Schemes.
Instructions:
- Use only the provided relationship types and properties in the schema.
- Do NOT use any relationship types or properties that are not provided.
- Always return `s.scheme_id AS scheme_id` alongside any requested scheme fields whenever `:Scheme` nodes are matched.
- Use case-insensitive matching (`toLower(...) CONTAINS toLower(...)`) for string filters.
- Never return embedding vectors (`s.embedding`).

Schema:
{schema}

Note: Do not include explanations or apologies. Output ONLY the Cypher query.

Question: {question}
Cypher Query:"""

SYNTHESIS_SYSTEM_PROMPT = """You are a helpful Tamil Nadu Government Schemes AI Assistant powered by a Neo4j Knowledge Graph.
Answer the user's question accurately using ONLY the provided Knowledge Graph Context (Vector Search matches + Cypher Graph Traversal results).

Formatting Guidelines:
- Structure your response clearly with scheme titles in **bold**, key benefits/subsidies, eligibility rules, and required documents.
- If multiple schemes apply, compare them concisely so a citizen or farmer can quickly pick the right one.
- Never fabricate schemes, subsidy percentages, or documents not present in the context.
- If the graph context does not contain an answer, clearly say so and suggest related schemes found in the context."""


class HybridGraphRAGEngine:
    def __init__(self):
        self.graph = get_langchain_graph()
        self.driver = get_neo4j_driver()
        api_secret = SecretStr(settings.OPENAI_API_KEY)

        self.llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
        )
        
        self.embeddings = OpenAIEmbeddings(
            model="text-embedding-3-small",
        )

        self.vector_store = Neo4jVector.from_existing_index(
            embedding=self.embeddings,
            url=settings.NEO4J_URI,
            username=settings.NEO4J_USERNAME,
            password=settings.NEO4J_PASSWORD,
            index_name=settings.VECTOR_INDEX_NAME,
            node_label="Scheme",
            text_node_property="description",
            embedding_node_property="embedding",
        )

        cypher_prompt = PromptTemplate(
            input_variables=["schema", "question"],
            template=CYPHER_GENERATION_TEMPLATE,
        )
        self.cypher_chain = GraphCypherQAChain.from_llm(
            llm=self.llm,
            graph=self.graph,
            cypher_prompt=cypher_prompt,
            verbose=False,
            return_intermediate_steps=True,
            allow_dangerous_requests=True,
        )

    def _vector_retrieve(self, question: str, k: int = 3, min_score: float = 0.55) -> List[Dict[str, Any]]:
        """Semantic similarity search over :Scheme nodes with relevance threshold."""
        docs = self.vector_store.similarity_search_with_score(question, k=k)
        results = []
        for doc, score in docs:
            if float(score) < min_score:
                continue
            meta = doc.metadata or {}
            results.append(
                {
                    "scheme_id": meta.get("scheme_id"),
                    "title": meta.get("title"),
                    "source_url": meta.get("source_url"),
                    "description": doc.page_content,
                    "similarity_score": round(float(score), 4),
                }
            )
        return results

    def _cypher_retrieve(self, question: str) -> Tuple[str, str, List[Dict[str, Any]]]:
        """Run Text-to-Cypher with read-only Cypher validation."""
        try:
            response = self.cypher_chain.invoke({"query": question})
            steps = response.get("intermediate_steps", [])
            raw_cypher = steps[0].get("query", "") if len(steps) > 0 else ""
            is_safe, validated_cypher = validate_generated_cypher(raw_cypher)
            if not is_safe:
                return validated_cypher, "", []
            raw_context = steps[1].get("context", []) if len(steps) > 1 else []
            return validated_cypher, response.get("result", ""), raw_context
        except Exception as exc:
            return f"// Cypher fallback triggered: {exc}", "", []

    def fetch_subgraph_for_schemes(
        self,
        scheme_ids: List[str],
        limit: int = 60,
        allow_full_fallback: bool = False,
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Fetch 1-hop neighborhood around matched :Scheme nodes formatted for react-force-graph-2d."""
        clean_ids = [sid for sid in set(scheme_ids) if sid]

        if not clean_ids and not allow_full_fallback:
            return {"nodes": [], "links": []}

        if clean_ids:
            cypher: LiteralString = """
            MATCH (s:Scheme)
            WHERE s.scheme_id IN $scheme_ids
            OPTIONAL MATCH (s)-[r]-(n)
            RETURN s, r, n
            LIMIT $limit
            """
            params: Dict[str, Any] = {"scheme_ids": clean_ids, "limit": limit}
        else:
            cypher = cast(
                LiteralString,
                """
                MATCH (s:Scheme)-[r]-(n)
                RETURN s, r, n
                LIMIT $limit
                """,
            )
            params = {"limit": limit}

        nodes_map: Dict[str, Dict[str, Any]] = {}
        links_list: List[Dict[str, Any]] = []
        seen_links = set()

        def register_node(node) -> str:
            if node is None:
                return ""
            elem_id = str(node.element_id)
            if elem_id not in nodes_map:
                labels = list(node.labels)
                primary_label = labels[0] if labels else "Entity"
                props = dict(node)
                props.pop("embedding", None)

                display_name = (
                    props.get("title")
                    or props.get("name")
                    or props.get("category")
                    or props.get("rule_summary")
                    or primary_label
                )
                nodes_map[elem_id] = {
                    "id": elem_id,
                    "label": primary_label,
                    "name": display_name,
                    "properties": props,
                }
            return elem_id

        with self.driver.session() as session:
            records = session.run(cypher, parameters=params)
            for rec in records:
                s_id = register_node(rec["s"])
                n_id = register_node(rec["n"])
                rel = rec["r"]
                if rel is not None and s_id and n_id:
                    src = str(rel.start_node.element_id)
                    tgt = str(rel.end_node.element_id)
                    rel_type = rel.type
                    link_key = (src, tgt, rel_type)
                    if link_key not in seen_links:
                        seen_links.add(link_key)
                        links_list.append(
                            {
                                "source": src,
                                "target": tgt,
                                "type": rel_type,
                            }
                        )

        return {"nodes": list(nodes_map.values()), "links": links_list}

    def answer_question(self, question: str) -> Dict[str, Any]:
        # 1. Input Guardrail Gate
        is_valid, validated_text = validate_user_input(question)
        if not is_valid:
            return {
                "answer": validated_text,
                "generated_cypher": "// Blocked by input guardrail (no query executed)",
                "matched_scheme_ids": [],
                "sources": [],
                "subgraph": {"nodes": [], "links": []},
            }

        # 2. Hybrid Retrieval
        vector_hits = self._vector_retrieve(validated_text, k=3)
        generated_cypher, cypher_summary, cypher_records = self._cypher_retrieve(validated_text)

        matched_scheme_ids = [hit["scheme_id"] for hit in vector_hits if hit.get("scheme_id")]
        for row in cypher_records:
            if isinstance(row, dict) and row.get("scheme_id"):
                matched_scheme_ids.append(row["scheme_id"])
            for match in re.findall(r"TN_SCHEME_\d+", str(row)):
                matched_scheme_ids.append(match)

        # 3. Abstention Guardrail if zero schemes matched
        if not matched_scheme_ids:
            return {
                "answer": "I could not find any Tamil Nadu Government schemes in the Knowledge Graph matching those specific criteria. Try asking about irrigation, solar pump sets, farm machinery, crop insurance, or millet cultivation.",
                "generated_cypher": generated_cypher,
                "matched_scheme_ids": [],
                "sources": [],
                "subgraph": {"nodes": [], "links": []},
            }

        subgraph = self.fetch_subgraph_for_schemes(matched_scheme_ids, allow_full_fallback=False)

        synthesis_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", SYNTHESIS_SYSTEM_PROMPT),
                (
                    "human",
                    "User Question: {question}\n\n"
                    "--- Vector Search Top Schemes ---\n{vector_context}\n\n"
                    "--- Cypher Graph Traversal Results ---\n{cypher_context}\n\n"
                    "--- Connected Graph Subgraph Facts ---\n{subgraph_facts}",
                ),
            ]
        )

        subgraph_facts = [
            f"[{n['label']}] {n['name']}: {n['properties']}"
            for n in subgraph["nodes"]
        ]

        chain = synthesis_prompt | self.llm
        final_msg = chain.invoke(
            {
                "question": validated_text,
                "vector_context": str(vector_hits),
                "cypher_context": f"Cypher Answer: {cypher_summary}\nRecords: {cypher_records}",
                "subgraph_facts": "\n".join(subgraph_facts[:35]),
            }
        )

        sources = []
        seen_urls = set()
        for hit in vector_hits:
            url = hit.get("source_url")
            title = hit.get("title")
            if url and title and (title, url) not in seen_urls:
                seen_urls.add((title, url))
                sources.append({"title": title, "url": url})

        return {
            "answer": final_msg.content,
            "generated_cypher": generated_cypher,
            "matched_scheme_ids": list(dict.fromkeys(matched_scheme_ids)),
            "sources": sources,
            "subgraph": subgraph,
        }