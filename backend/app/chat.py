"""OpenAI function-calling orchestration — routing only; math in tax_engine."""

from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from typing import Union
from uuid import UUID

from openai import AsyncOpenAI

from app.local_config import get_openai_api_key
from app.schemas import (
    ComplianceCalculationResponse,
    ComplianceConversationResponse,
    TaxRatesSXM,
)
from app.tax_engine import calculate_sxm_tot, calculate_sxm_wage_tax_and_szv

# Definitive tool declarations exposed to Allyanna's conversational runtime
AI_COMPLIANCE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "calculate_sxm_tot",
            "description": (
                "Calculates penny-perfect Turnover Tax (TOT) for a business "
                "profile in Sint Maarten using the local Decimal engine."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "gross_revenue": {
                        "type": "string",
                        "description": "The gross revenue amount as a string decimal",
                    }
                },
                "required": ["gross_revenue"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_sxm_wage_tax_and_szv",
            "description": (
                "Calculates Sint Maarten payroll deductions including progressive "
                "Wage Tax and capped SZV premiums via the local Decimal engine."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "gross_monthly_salary": {
                        "type": "string",
                        "description": (
                            "The base employee monthly salary amount as a string decimal"
                        ),
                    }
                },
                "required": ["gross_monthly_salary"],
            },
        },
    },
]


_AMOUNT_RE = re.compile(
    r"(?P<label>tot|turnover|revenue|salary|wage|payroll|gross)[^\d-]{0,24}"
    r"(?P<amount>\d+(?:[.,]\d+)?)",
    re.IGNORECASE,
)
_BARE_AMOUNT_RE = re.compile(r"\b(\d+(?:[.,]\d+)?)\b")


def _parse_amount(raw: str) -> Decimal:
    normalized = raw.replace(",", "")
    return Decimal(normalized)


def _local_route_without_llm(
    *,
    user_prompt: str,
    tenant_id: UUID,
    active_rates: TaxRatesSXM,
) -> Union[ComplianceCalculationResponse, ComplianceConversationResponse]:
    """
    Zero-cloud intent routing for desktop when no OpenAI key is configured.

    Extracts an amount from the prompt and routes to Decimal tax tools.
    Never performs LLM math.
    """
    lower = user_prompt.lower()
    amount: Decimal | None = None
    for match in _AMOUNT_RE.finditer(user_prompt):
        try:
            amount = _parse_amount(match.group("amount"))
            break
        except (InvalidOperation, ValueError):
            continue
    if amount is None:
        bare = _BARE_AMOUNT_RE.search(user_prompt)
        if bare:
            try:
                amount = _parse_amount(bare.group(1))
            except (InvalidOperation, ValueError):
                amount = None

    wants_payroll = any(
        k in lower for k in ("salary", "wage", "payroll", "szv", "loonbelasting")
    )
    wants_tot = any(k in lower for k in ("tot", "turnover", "revenue"))

    if amount is not None and wants_payroll and not wants_tot:
        computation_result = calculate_sxm_wage_tax_and_szv(amount, active_rates)
        return ComplianceCalculationResponse(
            tenant_id=tenant_id,
            calculation_type="wage_tax_szv",
            data=computation_result,
        )

    if amount is not None and (wants_tot or not wants_payroll):
        # Default numeric prompts without payroll keywords → TOT
        if wants_tot or not wants_payroll:
            computation_result = calculate_sxm_tot(amount, active_rates)
            return ComplianceCalculationResponse(
                tenant_id=tenant_id,
                calculation_type="tot",
                data=computation_result,
            )

    return ComplianceConversationResponse(
        tenant_id=tenant_id,
        message=(
            "Local offline mode (no OpenAI key). Ask for TOT on a revenue amount "
            'or wage/SZV on a salary, e.g. "TOT on 10000" or "payroll salary 3500". '
            "Optional cloud chat/OCR: set openai_api_key in "
            "%LOCALAPPDATA%\\Allyanna\\config.json."
        ),
    )


async def run_compliance_chat(
    *,
    user_prompt: str,
    tenant_id: UUID,
    active_rates: TaxRatesSXM,
) -> Union[ComplianceCalculationResponse, ComplianceConversationResponse]:
    """
    Asynchronous intent engine. Routes conversational payroll or tax execution
    exclusively to hardcoded arithmetic modules.
    """
    api_key = get_openai_api_key()
    if not api_key:
        return _local_route_without_llm(
            user_prompt=user_prompt,
            tenant_id=tenant_id,
            active_rates=active_rates,
        )

    openai_client = AsyncOpenAI(api_key=api_key)
    messages = [
        {
            "role": "system",
            "content": (
                f"You are Allyanna Accounting Software. You are currently serving "
                f"Tenant ID {tenant_id}. You are prohibited from running mathematical "
                f"tax math directly. You MUST call your local tools for calculations."
            ),
        },
        {"role": "user", "content": user_prompt},
    ]

    ai_response = await openai_client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        tools=AI_COMPLIANCE_TOOLS,
        tool_choice="auto",
    )

    response_message = ai_response.choices[0].message
    tool_calls = response_message.tool_calls

    if tool_calls:
        for tool_call in tool_calls:
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)

            if function_name == "calculate_sxm_tot":
                revenue = Decimal(str(function_args.get("gross_revenue")))
                computation_result = calculate_sxm_tot(revenue, active_rates)
                return ComplianceCalculationResponse(
                    tenant_id=tenant_id,
                    calculation_type="tot",
                    data=computation_result,
                )

            if function_name == "calculate_sxm_wage_tax_and_szv":
                salary = Decimal(str(function_args.get("gross_monthly_salary")))
                computation_result = calculate_sxm_wage_tax_and_szv(salary, active_rates)
                return ComplianceCalculationResponse(
                    tenant_id=tenant_id,
                    calculation_type="wage_tax_szv",
                    data=computation_result,
                )

    return ComplianceConversationResponse(
        tenant_id=tenant_id,
        message=response_message.content,
    )
