from typing import List, Optional
from pydantic import BaseModel, Field


class BenefitItem(BaseModel):
    category: str = Field(
        description="Normalized benefit category, e.g., 'Financial Subsidy', 'Loan Assistance', 'Equipment Grant', 'Insurance', 'Training'"
    )
    detail: str = Field(
        description="Specific benefit value or description, e.g., '50% subsidy up to Rs. 50,000'"
    )


class EligibilityRule(BaseModel):
    rule_summary: str = Field(
        description="Concise eligibility condition, e.g., 'Must hold agricultural land in Tamil Nadu'"
    )
    income_limit: Optional[str] = Field(
        default=None,
        description="Annual household income cap if mentioned, e.g., 'Below Rs. 2,00,000/year', else null"
    )
    land_or_age_criteria: Optional[str] = Field(
        default=None,
        description="Age bracket or landholding requirement if mentioned, e.g., 'Small & Marginal Farmers (up to 2 hectares)', else null"
    )


class ExtractedSchemeGraph(BaseModel):
    clean_title: str = Field(
        description="Clean, canonical title of the Tamil Nadu government scheme"
    )
    concise_description: str = Field(
        description="2-3 sentence clear summary of what the scheme does and who it helps"
    )
    department_name: str = Field(
        description="Administering Tamil Nadu government department name"
    )
    beneficiary_groups: List[str] = Field(
        default_factory=list,
        description="Normalized target groups, e.g., ['Small Farmers', 'Women Farmers', 'SC/ST Farmers', 'Students']"
    )
    benefits: List[BenefitItem] = Field(
        default_factory=list,
        description="List of financial or non-financial benefits provided by the scheme"
    )
    required_documents: List[str] = Field(
        default_factory=list,
        description="Normalized document names required to apply, e.g., ['Aadhaar Card', 'Chitta / Adangal', 'Bank Passbook', 'Income Certificate']"
    )
    eligibility_rules: List[EligibilityRule] = Field(
        default_factory=list,
        description="Key eligibility conditions required to qualify"
    )