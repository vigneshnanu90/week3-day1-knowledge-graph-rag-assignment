# Tamil Nadu Government Schemes — Hybrid GraphRAG & Live Subgraph Explorer

A full-stack **Knowledge Graph + Vector Retrieval-Augmented Generation (GraphRAG)** platform built with **Neo4j AuraDB**, **FastAPI**, **LangChain (`langchain-neo4j`)**, and **React (`react-force-graph-2d`)**.

Instead of treating government policy documents as isolated text chunks, this system models Tamil Nadu **Agriculture & Farmers Welfare Department (`dep_id=Mg==`)** schemes as an interconnected property graph—linking **Schemes**, **Departments**, **Beneficiary Groups**, **Benefits/Subsidies**, **Required Documents**, and **Eligibility Criteria**. Users can ask natural-language questions on the left while visually inspecting the exact traversed Neo4j subgraph on the right.

---

## Table of Contents
1. [Why GraphRAG for Government Schemes?](#1-why-graphrag-for-government-schemes)
2. [System Architecture & Data Flow](#2-system-architecture--data-flow)
3. [Neo4j Knowledge Graph Data Model](#3-neo4j-knowledge-graph-data-model)
4. [Tech Stack](#4-tech-stack)
5. [Core Features & Guardrails](#5-core-features--guardrails)
6. [Project Directory Structure](#6-project-directory-structure)
7. [End-to-End Setup & Execution Guide](#7-end-to-end-setup--execution-guide)
8. [API Reference](#8-api-reference)
9. [Sample Queries & Verification](#9-sample-queries--verification)

---

## 1. Why GraphRAG for Government Schemes?

Traditional vector-only RAG struggles with relational policy queries such as *"Which schemes require Chitta / Adangal and provide 100% subsidy to small farmers?"* because eligibility conditions and document checklists are scattered across multiple schemes.

By combining **Neo4j Property Graph Traversal** with **Neo4j Native Vector Search**, this application delivers:
* **Multi-Hop Relational Reasoning:** Connects shared entities (`Aadhaar Card`, `Chitta / Adangal`, `Small Farmers`) across schemes using Cypher traversals.
* **Semantic Recall:** Matches fuzzy citizen queries (e.g., *"help with daytime solar water pumping"*) to the right scheme via OpenAI embeddings (`text-embedding-3-small`).
* **Visual Explainability:** Every answer returns both a grounded natural-language summary and the live `{ nodes, links }` subgraph rendered in the React canvas, along with the generated Cypher query.

---

## 2. System Architecture & Data Flow

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ 1. DATA COLLECTION (backend/scraper/tn_scheme_scraper.py)                  │
│    Playwright + BeautifulSoup scraper targeting tn.gov.in (dep_id=Mg==)    │
│    with automatic fallback to verified TN Agriculture schemes dataset      │
│    ──▶ Outputs: backend/data/raw_schemes.json                              │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 2. ENTITY EXTRACTION & INGESTION (backend/graph_pipeline/)                 │
│    • Pydantic Schemas + GPT-4o-mini Structured Outputs (extractor.py)      │
│    • Idempotent Cypher MERGE + Uniqueness Constraints (ingest_neo4j.py)    │
│    • Native Neo4j Vector Index ('scheme_vector_index') on :Scheme nodes    │
│    ──▶ Populates: Neo4j AuraDB Cloud Instance                              │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 3. HYBRID GRAPHRAG API & GUARDRAILS (backend/app/)                         │
│    • Input Gate: Domain filter + Prompt Injection + Aadhaar PII blocker    │
│    • Parallel Retrieval: Neo4jVector similarity + Read-Only Text-to-Cypher │
│    • Subgraph Extractor: 1-hop neighborhood serialization                  │
│    ──▶ Exposes: POST /api/chat, GET /api/graph/initial, GET /api/health    │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ 4. SPLIT-SCREEN REACT EXPLORER (frontend/src/)                             │
│    • Left Pane: Conversational UI, starter prompts, Cypher trace drawer    │
│    • Right Pane: Interactive 2D Force Graph, Tree/Radial layouts,          │
│      Eligibility Highlight Chips, and Slide-Over Node Property Inspector   │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Neo4j Knowledge Graph Data Model

### Node Labels & Properties
| Node Label | Key Properties | Description |
| :--- | :--- | :--- |
| `:Department` | `name` *(unique)* | Administering Tamil Nadu government department |
| `:Scheme` | `scheme_id` *(unique)*, `title`, `description`, `source_url`, `embedding` | Core government welfare or departmental scheme |
| `:BeneficiaryGroup` | `name` *(unique)* | Canonical target citizen group (e.g., *Small Farmers*, *Women*, *Entrepreneurs*) |
| `:Benefit` | `category`, `detail` | Financial subsidy, grant, loan, or insurance coverage |
| `:Document` | `name` *(unique)* | Standardized required certificate/ID (e.g., *Aadhaar Card*, *Chitta / Adangal*) |
| `:EligibilityCriteria` | `rule_summary`, `income_limit`, `land_or_age_criteria` | Specific qualifying rules, landholding caps, or age brackets |

### Relationship Types
```cypher
(:Department)-[:ADMINISTERS]->(:Scheme)
(:Scheme)-[:TARGETS]->(:BeneficiaryGroup)
(:Scheme)-[:PROVIDES]->(:Benefit)
(:Scheme)-[:REQUIRES_DOCUMENT]->(:Document)
(:Scheme)-[:HAS_CRITERIA]->(:EligibilityCriteria)
```

---

## 4. Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Web Scraping** | Python 3.13, Playwright (Async Chromium), BeautifulSoup4 |
| **Knowledge Graph & Vector DB** | Neo4j AuraDB (Cloud), Cypher, Neo4j Native Vector Index |
| **LLM & Graph Orchestration** | `langchain-neo4j`, `langchain-openai`, OpenAI `gpt-4o-mini`, `text-embedding-3-small`, Pydantic v2 |
| **Backend API** | FastAPI, Uvicorn, Python-Dotenv |
| **Frontend UI** | React 19, Vite, Tailwind CSS v4, `react-force-graph-2d`, `react-markdown`, Lucide Icons, Axios |

---

## 5. Core Features & Guardrails

### Multi-Layer Guardrails (`backend/app/guardrails.py`)
1. **Domain Relevance Gate:** Rejects off-topic queries (sports, general trivia, etc.) before calling OpenAI or Neo4j, saving latency and API tokens.
2. **PII & Prompt Injection Protection:** Blocks 12-digit Aadhaar-like numbers so citizens do not accidentally submit sensitive personal IDs, and filters known jailbreak/injection patterns.
3. **Strict Read-Only Cypher Validation:** Inspects every LLM-generated Cypher query with a regex blocker to reject mutating or administrative keywords (`DELETE`, `DETACH`, `DROP`, `CREATE`, `MERGE`, `SET`, `REMOVE`, `LOAD CSV`, `CALL db.`) prior to execution.
4. **Similarity Threshold & Abstention:** Filters low-confidence vector matches (`min_score = 0.55`) and returns an empty subgraph with a helpful abstention message if zero relevant schemes match.

### Split-Screen Interactive UI (`frontend/src/components/`)
* **3-Mode Graph Layout Switcher:** Toggle instantaneously between **Network** (force-directed), **Tree** (top-down hierarchy), and **Radial** (starburst) views.
* **Citizen Eligibility Quick-Filter Chips:** Highlight eligible schemes and their connected documents in gold with one click (*Small Farmers*, *Women*, *100% Subsidy*, *Chitta / Adangal*, *Solar / Irrigation*).
* **Smart Zoom-Aware Labels & Hover Spotlight:** Prevents text overlap by showing dark pill backdrops, progressive zoom labels, and neighbor spotlighting on hover.
* **Node Inspector Drawer:** Click any node on the canvas to inspect all stored Neo4j properties and open portal links.
* **Explainable Cypher Trace:** Expand **"View Cypher"** under any assistant response to inspect the exact Cypher query executed against Neo4j AuraDB.

---

## 6. Project Directory Structure

```text
knowledge-gragh-assignment/
├── .env                                # Local secrets (excluded from Git)
├── .env.example                        # Environment variable template
├── .gitignore                          # Excludes .env, venv, node_modules, cache
├── README.md                           # Project documentation
│
├── backend/
│   ├── requirements.txt                # Python dependencies
│   ├── data/
│   │   ├── raw_schemes.json            # Scraped / structured TN Govt scheme records
│   │   └── extracted_graph.json        # Cached LLM-extracted graph entities
│   ├── scraper/
│   │   ├── __init__.py
│   │   └── tn_scheme_scraper.py        # Async Playwright scraper + verified fallback
│   ├── graph_pipeline/
│   │   ├── __init__.py
│   │   ├── schemas.py                  # Pydantic models for structured extraction
│   │   ├── extractor.py                # OpenAI structured entity extractor
│   │   └── ingest_neo4j.py             # Neo4j AuraDB Cypher MERGE + Vector Index setup
│   └── app/
│       ├── __init__.py
│       ├── main.py                     # FastAPI app initialization & CORS middleware
│       ├── config.py                   # Settings, Neo4j driver & LangChain graph loaders
│       ├── guardrails.py               # Input domain/PII checks & read-only Cypher guard
│       ├── graph_rag.py                # Hybrid retriever + subgraph serializer
│       └── routes.py                   # REST API endpoints (/api/chat, /api/graph/initial)
│
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        ├── index.css
        ├── App.jsx                     # Split-screen state & layout controller
        ├── api/
        │   └── client.js               # Axios HTTP client
        └── components/
            ├── ChatPane.jsx            # Chat stream, starter prompts, Cypher accordion
            ├── GraphExplorerPane.jsx   # ForceGraph2D canvas, layout switcher, filter chips
            └── NodeInspectorDrawer.jsx # Slide-over node property drawer
```

---

## 7. End-to-End Setup & Execution Guide

### Prerequisites
* **Python 3.11+**
* **Node.js 18+** and **npm**
* **Neo4j AuraDB Free Instance** ([console.neo4j.io](https://console.neo4j.io))
* **OpenAI API Key**

### Step 1: Configure Environment Variables
Create a `.env` file in the root directory (`knowledge-gragh-assignment/.env`):
```env
NEO4J_URI=neo4j+ssc://<your-instance-id>.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<your-auradb-password>
OPENAI_API_KEY=sk-proj-...
```
> **Note:** Using `neo4j+ssc://` maintains full TLS encryption while preventing SSL certificate chain verification errors on Windows networks/proxies.

### Step 2: Set Up Python Virtual Environment & Ingest Data
```bat
python -m venv venv
venv\Scripts\activate
pip install fastapi uvicorn playwright beautifulsoup4 langchain-neo4j langchain-openai langchain-core neo4j openai pydantic python-dotenv
playwright install chromium

:: 1. Collect Tamil Nadu scheme data into backend/data/raw_schemes.json
python backend\scraper\tn_scheme_scraper.py

:: 2. Extract graph entities & load nodes, relationships, and vector index into Neo4j AuraDB
python backend\graph_pipeline\ingest_neo4j.py
```

### Step 3: Start the FastAPI Backend
```bat
cd backend
uvicorn app.main:app --reload --port 8000
```
* Swagger API Docs: `http://127.0.0.1:8000/docs`

### Step 4: Start the React Frontend
Open a second terminal from the project root:
```bat
cd frontend
npm install
npm run dev
```
* Web Application UI: `http://localhost:5173`

---

## 8. API Reference

| Method | Endpoint | Request Body / Params | Response Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | — | Verifies live connectivity to Neo4j AuraDB |
| `GET` | `/api/graph/initial` | `?limit=90` | Returns initial `{ nodes, links }` overview graph for the canvas |
| `POST` | `/api/chat` | `{"question": "..."}` | Runs guardrails + hybrid retrieval; returns `answer`, `generated_cypher`, `matched_scheme_ids`, `sources`, and traversed `subgraph` |

---

## 9. Sample Queries & Verification

### Demo Questions to Try in the Chat Pane
* *"Which schemes give subsidies for solar pump sets or micro irrigation?"*
* *"What schemes require Chitta / Adangal and target small farmers?"*
* *"Compare the farm machinery subsidy vs Kuruvai cultivation special package."*
* *"Are there any schemes for agriculture graduates or youth entrepreneurs?"*

### Verify Graph Directly in Neo4j Aura Console (Query Tab)
```cypher
// View all connected scheme clusters
MATCH (n)-[r]->(m)
RETURN n, r, m
LIMIT 100;

// Find schemes sharing the same required document
MATCH (s:Scheme)-[:REQUIRES_DOCUMENT]->(d:Document {name: "Chitta / Adangal"})
RETURN s.title AS Scheme, d.name AS RequiredDocument;
```