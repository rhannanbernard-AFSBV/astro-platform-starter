import { Icon } from './Icons';
import Price from './Price';
import {
    computePayment,
    formatDual,
    moneyXcg,
    usdCentsToXcgCents,
    xcgCentsToUsdCents,
} from './math';
import type { PaymentMethod } from './types';

export type TenderCurrency = 'USD' | 'XCG';

export type PayGuestOption = {
    id: string;
    name: string;
    totalCents: number;
    paidAt: string | null;
};

type Props = {
    totalCents: number;
    payMethod: PaymentMethod;
    tenderCurrency: TenderCurrency;
    cashInput: string;
    cardInput: string;
    preferredMethod: PaymentMethod | null;
    guests: PayGuestOption[];
    selectedGuestId: string | null;
    onSelectGuest: (guestId: string | null) => void;
    onMethod: (method: PaymentMethod) => void;
    onCurrency: (currency: TenderCurrency) => void;
    onCashInput: (value: string) => void;
    onCardInput: (value: string) => void;
    onComplete: () => void;
    onCancel: () => void;
};

function toUsdCents(amountInput: string, currency: TenderCurrency): number {
    const major = Number(amountInput || 0);
    const minor = Math.round(major * 100);
    return currency === 'XCG' ? xcgCentsToUsdCents(minor) : minor;
}

export function paymentInputsToUsd(
    payMethod: PaymentMethod,
    tenderCurrency: TenderCurrency,
    cashInput: string,
    cardInput: string,
) {
    return {
        cashCents: toUsdCents(cashInput, tenderCurrency),
        cardCents: toUsdCents(cardInput, tenderCurrency),
        payMethod,
    };
}

export default function PaymentModal({
    totalCents,
    payMethod,
    tenderCurrency,
    cashInput,
    cardInput,
    preferredMethod,
    guests,
    selectedGuestId,
    onSelectGuest,
    onMethod,
    onCurrency,
    onCashInput,
    onCardInput,
    onComplete,
    onCancel,
}: Props) {
    const { cashCents, cardCents } = paymentInputsToUsd(
        payMethod,
        tenderCurrency,
        cashInput,
        cardInput,
    );
    const preview = computePayment(totalCents, payMethod, cashCents, cardCents);
    const totalInCurrency =
        tenderCurrency === 'XCG'
            ? (usdCentsToXcgCents(totalCents) / 100).toFixed(2)
            : (totalCents / 100).toFixed(2);
    const unpaid = guests.filter((guest) => !guest.paidAt && guest.totalCents > 0);
    const showGuestSplit = unpaid.length > 0;

    return (
        <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Take payment">
            <div className="receipt-sheet modifier-sheet">
                <div className="receipt-toolbar">
                    <div>
                        <p className="eyebrow">Payment</p>
                        <h2>
                            <Price cents={totalCents} compact />
                        </h2>
                        <p className="fx-note">Pay in USD or XCG · 1.80 XCG = 1 USD</p>
                        {preferredMethod && (
                            <p className="pin-help">Guest selected: {preferredMethod}</p>
                        )}
                    </div>
                    <button type="button" className="ghost" onClick={onCancel} aria-label="Cancel payment">
                        <Icon name="close" />
                    </button>
                </div>
                <div className="modifier-body">
                    {showGuestSplit && (
                        <div className="pay-guest-block">
                            <p className="eyebrow">Pay per guest</p>
                            <div className="tip-presets" role="group" aria-label="Pay for guest">
                                <button
                                    type="button"
                                    className={selectedGuestId === null ? 'active' : ''}
                                    onClick={() => onSelectGuest(null)}
                                >
                                    Full table
                                </button>
                                {unpaid.map((guest) => (
                                    <button
                                        key={guest.id}
                                        type="button"
                                        className={selectedGuestId === guest.id ? 'active' : ''}
                                        onClick={() => onSelectGuest(guest.id)}
                                    >
                                        {guest.name} · ${(guest.totalCents / 100).toFixed(2)}
                                    </button>
                                ))}
                            </div>
                            {guests.some((guest) => guest.paidAt) && (
                                <p className="pin-help">
                                    Already paid:{' '}
                                    {guests
                                        .filter((guest) => guest.paidAt)
                                        .map((guest) => guest.name)
                                        .join(', ')}
                                </p>
                            )}
                        </div>
                    )}
                    <div className="tip-presets" role="group" aria-label="Tender currency">
                        {(['USD', 'XCG'] as TenderCurrency[]).map((currency) => (
                            <button
                                key={currency}
                                type="button"
                                className={tenderCurrency === currency ? 'active' : ''}
                                onClick={() => onCurrency(currency)}
                            >
                                {currency}
                            </button>
                        ))}
                    </div>
                    <div className="tip-presets">
                        {(['cash', 'card', 'mixed'] as PaymentMethod[]).map((method) => (
                            <button
                                key={method}
                                type="button"
                                className={payMethod === method ? 'active' : ''}
                                onClick={() => onMethod(method)}
                            >
                                {method}
                                {preferredMethod === method ? ' ✓' : ''}
                            </button>
                        ))}
                    </div>
                    <p className="pin-help">
                        Amount due in {tenderCurrency}:{' '}
                        {tenderCurrency === 'XCG' ? moneyXcg(totalCents) : `$${totalInCurrency}`}
                        {selectedGuestId
                            ? ` · ${unpaid.find((g) => g.id === selectedGuestId)?.name ?? 'Guest'}`
                            : ''}
                    </p>
                    {(payMethod === 'cash' || payMethod === 'mixed') && (
                        <label className="custom-tip">
                            Cash tendered ({tenderCurrency})
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={cashInput}
                                onChange={(event) => onCashInput(event.target.value)}
                            />
                        </label>
                    )}
                    {(payMethod === 'card' || payMethod === 'mixed') && (
                        <label className="custom-tip">
                            Card amount ({tenderCurrency})
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={cardInput}
                                onChange={(event) => onCardInput(event.target.value)}
                            />
                        </label>
                    )}
                    <div className="bill-summary">
                        <div>
                            <span>Change due</span>
                            <strong>{formatDual(preview.changeDueCents)}</strong>
                        </div>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="secondary-button" onClick={onCancel}>
                            Cancel
                        </button>
                        <button type="button" className="generate-button" onClick={onComplete}>
                            {selectedGuestId ? 'Pay guest' : 'Complete payment'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
