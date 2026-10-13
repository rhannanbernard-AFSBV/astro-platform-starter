import Decimal from 'decimal.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * Hardcoded precise bidding math — never call an LLM for these figures.
 *
 * Chain:
 *   Raw Shift Hours = Cleanable SqFt / ISSA rate
 *   True Hourly = Base Wage * Labor Burden Multiplier
 *   Labor Cost = Hours * True Hourly
 *   Operational = Labor * (1 + Consumables Rate)   [default 2.5%]
 *   Pre-Tax = Operational / (1 - Margin)
 *   Final/Shift = Pre-Tax / (1 - TOT)              [SXM 5% from DB]
 *   Monthly = (Final/Shift * Shifts/Year) / 12
 */

function d(value) {
  return new Decimal(value ?? 0);
}

function money(value) {
  return d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function hours(value) {
  return d(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function formatMoney(amount, symbol, code) {
  const n = money(amount).toFixed(2);
  if (code === 'EUR' || code === 'XCG') {
    return `${symbol}${n}`;
  }
  return `${symbol}${n}`;
}

/**
 * @param {object} input
 * @param {number|string} input.totalCleanableSqFt
 * @param {object} input.tenantSettings
 * @param {object} input.jurisdiction
 * @param {object} input.issaRate
 * @param {object} input.primaryCurrency
 * @param {object|null} input.secondaryCurrency
 * @param {Array} [input.substrateBreakdown]
 * @param {Array} [input.detectedFixtures]
 */
export function calculateBidLedger(input) {
  const {
    totalCleanableSqFt,
    tenantSettings,
    jurisdiction,
    issaRate,
    primaryCurrency,
    secondaryCurrency,
    substrateBreakdown = [],
    detectedFixtures = [],
  } = input;

  const sqFt = d(totalCleanableSqFt);
  if (sqFt.lte(0)) {
    throw new Error('total_cleanable_sq_ft must be > 0');
  }

  // Substrate / fixture density adjustments (deterministic, not LLM)
  let densityFactor = d(1);
  const carpetShare = substrateBreakdown
    .filter((s) => /carpet|high-pile/i.test(s.material || ''))
    .reduce((acc, s) => acc.plus(d(s.percentage || 0)), d(0));
  if (carpetShare.gte(40)) densityFactor = densityFactor.times('0.92');
  if (carpetShare.gte(70)) densityFactor = densityFactor.times('0.95');

  const fixtureCount = detectedFixtures.reduce(
    (acc, f) => acc.plus(d(f.count || 0)),
    d(0)
  );
  if (fixtureCount.gte(40)) densityFactor = densityFactor.times('0.90');
  else if (fixtureCount.gte(20)) densityFactor = densityFactor.times('0.95');

  const baseIssa = d(issaRate.sq_ft_per_hour);
  const adjustedIssa = money(baseIssa.times(densityFactor));
  const rawShiftHours = hours(sqFt.div(adjustedIssa));

  const baseWage = d(tenantSettings.base_hourly_wage);
  const burden = d(jurisdiction.labor_burden_multiplier);
  const trueHourly = money(baseWage.times(burden));
  const laborCost = money(rawShiftHours.times(trueHourly));

  const consumablesRate = d(jurisdiction.consumables_rate);
  const operational = money(laborCost.times(d(1).plus(consumablesRate)));

  const marginPct = d(tenantSettings.target_margin_percentage).div(100);
  const customMarkup = d(tenantSettings.custom_markup_percentage || 0).div(100);
  const effectiveMargin = marginPct.plus(customMarkup);
  if (effectiveMargin.gte(1) || effectiveMargin.lt(0)) {
    throw new Error('Invalid margin configuration');
  }
  const preTax = money(operational.div(d(1).minus(effectiveMargin)));

  const totRate = d(jurisdiction.tot_rate);
  if (totRate.gte(1) || totRate.lt(0)) {
    throw new Error('Invalid TOT rate');
  }
  const finalPerShift = money(preTax.div(d(1).minus(totRate)));

  const shiftsPerYear = d(tenantSettings.shifts_per_year || 260);
  const monthly = money(finalPerShift.times(shiftsPerYear).div(12));

  const totAmount = money(finalPerShift.minus(preTax));
  const marginAmount = money(preTax.minus(operational));

  const primaryCode = primaryCurrency.currency_code;
  const primarySymbol = primaryCurrency.currency_symbol;

  // Convert amounts: exchange_rate_to_usd means "units of currency per 1 USD"
  // Primary amounts are computed in tenant primary currency units (wages seeded in primary).
  const dual = Boolean(tenantSettings.enable_dual_quoting && secondaryCurrency);
  let secondaryLedger = null;
  if (dual) {
    const primaryToUsd = d(1).div(d(primaryCurrency.exchange_rate_to_usd));
    const usdToSecondary = d(secondaryCurrency.exchange_rate_to_usd);
    const convert = (amt) => money(d(amt).times(primaryToUsd).times(usdToSecondary));
    secondaryLedger = {
      currency_code: secondaryCurrency.currency_code,
      currency_symbol: secondaryCurrency.currency_symbol,
      exchange_rate_to_usd: Number(d(secondaryCurrency.exchange_rate_to_usd).toFixed(4)),
      is_fixed_peg: Boolean(secondaryCurrency.is_fixed_peg),
      recommended_monthly_invoice_price: Number(convert(monthly)),
      final_price_per_shift: Number(convert(finalPerShift)),
      formatted_monthly: formatMoney(
        convert(monthly),
        secondaryCurrency.currency_symbol,
        secondaryCurrency.currency_code
      ),
      conversion_note:
        primaryCode === 'USD'
          ? `1 USD = ${d(secondaryCurrency.exchange_rate_to_usd).toFixed(4)} ${secondaryCurrency.currency_code}${secondaryCurrency.is_fixed_peg ? ' (fixed peg)' : ''}`
          : `Converted via USD using tenant exchange index`,
    };
  }

  const steps = [
    {
      step: 1,
      label: 'ISSA raw shift hours',
      formula: 'Cleanable SqFt / (ISSA rate × density factor)',
      inputs: {
        total_cleanable_sq_ft: Number(sqFt.toFixed(2)),
        issa_sq_ft_per_hour: Number(baseIssa.toFixed(2)),
        density_factor: Number(densityFactor.toFixed(4)),
        adjusted_issa_sq_ft_per_hour: Number(adjustedIssa),
      },
      result: Number(rawShiftHours),
    },
    {
      step: 2,
      label: 'True hourly labor cost',
      formula: 'Base hourly wage × labor burden multiplier',
      inputs: {
        base_hourly_wage: Number(money(baseWage)),
        labor_burden_multiplier: Number(burden.toFixed(4)),
      },
      result: Number(trueHourly),
    },
    {
      step: 3,
      label: 'Total shift labor cost',
      formula: 'Raw shift hours × true hourly labor cost',
      result: Number(laborCost),
    },
    {
      step: 4,
      label: 'Total operational shift cost',
      formula: 'Labor cost × (1 + consumables rate)',
      inputs: { consumables_rate: Number(consumablesRate.toFixed(4)) },
      result: Number(operational),
    },
    {
      step: 5,
      label: 'Pre-tax price per shift',
      formula: 'Operational cost / (1 − target margin)',
      inputs: {
        target_margin: Number(effectiveMargin.toFixed(4)),
      },
      result: Number(preTax),
    },
    {
      step: 6,
      label: 'Final price per shift (incl. TOT)',
      formula: 'Pre-tax / (1 − TOT rate)',
      inputs: {
        tot_rate: Number(totRate.toFixed(4)),
        tot_amount_per_shift: Number(totAmount),
        jurisdiction: jurisdiction.jurisdiction_code,
      },
      result: Number(finalPerShift),
    },
    {
      step: 7,
      label: 'Monthly flat invoice',
      formula: '(Final per shift × shifts per year) / 12',
      inputs: { shifts_per_year: Number(shiftsPerYear) },
      result: Number(monthly),
    },
  ];

  return {
    spatial_summary: {
      total_cleanable_sq_ft: Number(sqFt.toFixed(2)),
      substrate_breakdown: substrateBreakdown,
      detected_fixtures: detectedFixtures,
    },
    financial_ledger: {
      recommended_shift_hours: Number(rawShiftHours),
      calculated_labor_cost_per_shift: Number(laborCost),
      total_operational_cost_per_shift: Number(operational),
      recommended_monthly_invoice_price: Number(monthly),
      // Extended detail (spec)
      base_currency: {
        currency_code: primaryCode,
        currency_symbol: primarySymbol,
        exchange_rate_to_usd: Number(d(primaryCurrency.exchange_rate_to_usd).toFixed(4)),
      },
      final_price_charged_per_shift: Number(finalPerShift),
      pre_tax_price_per_shift: Number(preTax),
      margin_amount_per_shift: Number(marginAmount),
      tot_amount_per_shift: Number(totAmount),
      tot_rate: Number(totRate.toFixed(4)),
      consumables_rate: Number(consumablesRate.toFixed(4)),
      labor_burden_multiplier: Number(burden.toFixed(4)),
      true_hourly_labor_cost: Number(trueHourly),
      formatted_monthly: formatMoney(monthly, primarySymbol, primaryCode),
      formatted_per_shift: formatMoney(finalPerShift, primarySymbol, primaryCode),
      dual_currency: secondaryLedger,
      calculation_steps: steps,
    },
  };
}

export { formatMoney, money, d };
