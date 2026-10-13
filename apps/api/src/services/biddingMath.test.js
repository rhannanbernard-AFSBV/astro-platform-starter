import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBidLedger } from './biddingMath.js';

const base = {
  totalCleanableSqFt: 10000,
  tenantSettings: {
    base_hourly_wage: 18,
    target_margin_percentage: 30,
    custom_markup_percentage: 0,
    shifts_per_year: 260,
    enable_dual_quoting: true,
  },
  jurisdiction: {
    jurisdiction_code: 'SXM',
    tot_rate: 0.05,
    labor_burden_multiplier: 1.12,
    consumables_rate: 0.025,
  },
  issaRate: { sq_ft_per_hour: 3500 },
  primaryCurrency: {
    currency_code: 'USD',
    currency_symbol: '$',
    exchange_rate_to_usd: 1,
    is_fixed_peg: true,
  },
  secondaryCurrency: {
    currency_code: 'XCG',
    currency_symbol: 'Cg',
    exchange_rate_to_usd: 1.79,
    is_fixed_peg: true,
  },
  substrateBreakdown: [{ material: 'LVT', percentage: 100 }],
  detectedFixtures: [],
};

describe('calculateBidLedger', () => {
  it('chains ISSA → burden → consumables → margin → TOT → monthly', () => {
    const { financial_ledger: L } = calculateBidLedger(base);

    // Hours = 10000/3500 ≈ 2.86
    assert.equal(L.recommended_shift_hours, 2.86);

    // True hourly = 18 * 1.12 = 20.16
    assert.equal(L.true_hourly_labor_cost, 20.16);

    // Labor = 2.86 * 20.16 = 57.66
    assert.equal(L.calculated_labor_cost_per_shift, 57.66);

    // Operational = 57.66 * 1.025 = 59.10
    assert.equal(L.total_operational_cost_per_shift, 59.1);

    // Pre-tax = 59.10 / 0.70 = 84.43
    assert.equal(L.pre_tax_price_per_shift, 84.43);

    // Final = 84.43 / 0.95 = 88.87
    assert.equal(L.final_price_charged_per_shift, 88.87);

    // Monthly = 88.87 * 260 / 12 = 1925.52
    assert.equal(L.recommended_monthly_invoice_price, 1925.52);

    assert.equal(L.formatted_monthly, '$1925.52');
    assert.ok(L.dual_currency);
    assert.equal(L.dual_currency.currency_code, 'XCG');
    // 1925.52 * 1.79
    assert.equal(L.dual_currency.recommended_monthly_invoice_price, 3446.68);
    assert.match(L.dual_currency.formatted_monthly, /^Cg/);
  });

  it('never uses float drift — money strings have 2 decimals', () => {
    const { financial_ledger: L } = calculateBidLedger({
      ...base,
      totalCleanableSqFt: 12345.67,
    });
    for (const key of [
      'calculated_labor_cost_per_shift',
      'total_operational_cost_per_shift',
      'recommended_monthly_invoice_price',
    ]) {
      const s = L[key].toFixed(2);
      assert.equal(Number(s), L[key]);
    }
  });
});
