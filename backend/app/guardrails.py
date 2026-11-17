import re
from typing import Tuple

FORBIDDEN_CYPHER_KEYWORDS = re.compile(
    r"\b(DELETE|DETACH|DROP|CREATE|MERGE|SET|REMOVE|LOAD\s+CSV|FOREACH|CALL\s+db\.|CALL\s+apoc\.)\b",
    re.IGNORECASE,
)

INJECTION_PATTERNS = re.compile(
    r"(ignore\s+(all\s+)?previous\s+instructions|system\s+prompt|act\s+as\s+a|drop\s+database|match\s*\(n\)\s*detach\s+delete)",
    re.IGNORECASE,
)

AADHAAR_PATTERN = re.compile(r"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b")

DOMAIN_KEYWORDS = {
    "scheme", "schemes", "subsidy", "subsidies", "farmer", "farmers", "agriculture",
    "crop", "paddy", "millet", "irrigation", "solar", "pump", "tractor", "machinery",
    "loan", "insurance", "document", "documents", "aadhaar", "chitta", "adangal",
    "eligibility", "eligible", "benefit", "benefits", "pension", "scholarship",
    "tamil nadu", "tn", "department", "welfare", "uzhavar", "kuruvai", "kaviadp",
    "pmfby", "smam", "acabc", "land", "hectare", "acre", "women", "sc/st", "youth",
    "graduate", "entrepreneur", "certificate", "income", "apply", "application",
    "horticulture", "drip", "sprinkler", "electricity", "tangedco", "delta"
}


def validate_user_input(question: str) -> Tuple[bool, str]:
    """Input guardrail: blocks prompt injections, PII leaks, and off-topic queries."""
    cleaned = question.strip()

    if INJECTION_PATTERNS.search(cleaned):
        return (
            False,
            "Your query was blocked by the security guardrail due to disallowed instruction patterns.",
        )

    if AADHAAR_PATTERN.search(cleaned):
        return (
            False,
            "For your privacy, please do not enter Aadhaar or personal ID numbers in the chat. Ask about scheme rules or required documents instead.",
        )

    tokens = set(re.findall(r"[a-z/]+", cleaned.lower()))
    if not tokens.intersection(DOMAIN_KEYWORDS):
        return (
            False,
            "I am specialized in **Tamil Nadu Government Schemes** (subsidies, eligibility rules, farm equipment, irrigation, crop insurance, and required documents). Please ask a question related to government schemes.",
        )

    return True, cleaned


def validate_generated_cypher(cypher: str) -> Tuple[bool, str]:
    """Cypher execution guardrail: guarantees strict READ-ONLY database access."""
    if not cypher or not cypher.strip():
        return False, ""
    if FORBIDDEN_CYPHER_KEYWORDS.search(cypher):
        return False, "// Blocked unsafe write/admin Cypher statement"
    return True, cypher