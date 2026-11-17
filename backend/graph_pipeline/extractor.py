import json
import os
from pathlib import Path
from typing import List, cast

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from schemas import ExtractedSchemeGraph

load_dotenv()

RAW_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "raw_schemes.json"
EXTRACTED_DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "extracted_graph.json"

SYSTEM_PROMPT = """You are an expert Knowledge Graph architect modeling Tamil Nadu Government welfare and departmental schemes.
Extract clean, canonical entities from the provided scheme text so they can be merged into a Neo4j property graph.

Normalization Rules:
1. Reuse consistent labels for common entities:
   - Beneficiary groups: use broad reusable terms like 'Small Farmers', 'Marginal Farmers', 'Women', 'Students', 'Senior Citizens', 'Entrepreneurs', 'SC/ST Beneficiaries'.
   - Required documents: use standard names like 'Aadhaar Card', 'Ration Card', 'Income Certificate', 'Community Certificate', 'Chitta / Adangal', 'Bank Passbook', 'Passport Size Photo'.
2. If specific documents or income limits are not explicitly stated in the text, leave those lists/fields empty rather than guessing.
3. Keep descriptions factual, clear, and concise."""


def build_extractor_chain():
    api_key = os.getenv("OPENAI_API_KEY", "")
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0,
        api_key=SecretStr(api_key),
    )
    structured_llm = llm.with_structured_output(ExtractedSchemeGraph)

    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM_PROMPT),
            (
                "human",
                "Department: {department}\n"
                "Raw Title: {title}\n"
                "Table Summary: {summary_table_text}\n"
                "Detailed Page Content: {detailed_page_text}\n"
                "Source URL: {source_url}",
            ),
        ]
    )
    return prompt | structured_llm


def run_extraction(force_refresh: bool = False) -> List[dict]:
    if EXTRACTED_DATA_PATH.exists() and not force_refresh:
        print(f"[*] Loading cached extracted entities from {EXTRACTED_DATA_PATH}")
        with open(EXTRACTED_DATA_PATH, "r", encoding="utf-8") as f:
            return json.load(f)

    if not RAW_DATA_PATH.exists():
        raise FileNotFoundError(
            f"Raw scraped file not found at {RAW_DATA_PATH}. Run tn_scheme_scraper.py first."
        )

    with open(RAW_DATA_PATH, "r", encoding="utf-8") as f:
        raw_schemes = json.load(f)

    chain = build_extractor_chain()
    extracted_records = []

    print(f"[*] Extracting Knowledge Graph entities from {len(raw_schemes)} schemes...")
    for idx, item in enumerate(raw_schemes, start=1):
        print(f"  [{idx}/{len(raw_schemes)}] Extracting: {item['title'][:65]}...")
        result = cast(
            ExtractedSchemeGraph,
            chain.invoke(
                {
                    "department": item.get("department", ""),
                    "title": item.get("title", ""),
                    "summary_table_text": item.get("summary_table_text", ""),
                    "detailed_page_text": item.get("detailed_page_text", "")[:6000],
                    "source_url": item.get("source_url", ""),
                }
            ),
        )
        record = result.model_dump()
        record["scheme_id"] = item["scheme_id"]
        record["source_url"] = item.get("source_url", "")
        extracted_records.append(record)

    with open(EXTRACTED_DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(extracted_records, f, ensure_ascii=False, indent=2)

    print(f"[✓] Saved {len(extracted_records)} structured graph records to {EXTRACTED_DATA_PATH}")
    return extracted_records


if __name__ == "__main__":
    run_extraction()