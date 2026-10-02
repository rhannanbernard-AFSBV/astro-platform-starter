"""OpenAI function-calling orchestration — routing only; math in tax_engine."""

from __future__ import annotations

import json
import os
from decimal import Decimal
from typing import Union
from uuid import UUID

from openai import AsyncOpenAI

from app.schemas import (
    ComplianceCalculationResponse,
    ComplianceConversationResponse,
    TaxRatesSXM,
)
from app.tax_engine import calculate_sxm_tot, calculate_sxm_wage_tax_and_szv

openai_client = AsyncOpenAI(api_key=os.environ.get("OPENAI_API_KEY", "mock-key"))

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
