import { Icon } from './Icons';
import Price from './Price';
import { lineTotalCents, moneyUsd, tipAmountLabel, unitPriceCents, type BillResult } from './math';
import { TIP_AMOUNT_PRESETS, type MenuItem, type TableOrder, type TipAmountPreset } from './types';

type Props = {
    activeTable: TableOrder;
    menuById: Map<string, MenuItem>;
    bill: BillResult;
    itemCount: number;
    draftCount: number;
    isPaid: boolean;
    shareFeedback: string | null;
    canClear: boolean;
    canSendKitchen: boolean;
    canGenerateBill: boolean;
    canTakePayment: boolean;
    canReopen: boolean;
    canDeleteTickets: boolean;
    onClear: () => void;
    onAddGuest: () => void;
    onRenameGuest: (guestId: string, name: string) => void;
    onRemoveGuest: (guestId: string) => void;
    onChangeQuantity: (lineId: string, change: number) => void;
    onDeleteLine: (lineId: string) => void;
    onAssignGuest: (lineId: string, guestId: string) => void;
    onTipPreset: (preset: TipAmountPreset) => void;
    onCustomTipDollars: (value: number) => void;
    onServiceChargeEnabled: (enabled: boolean) => void;
    onServiceChargePercent: (value: number) => void;
    onSendKitchen: () => void;
    onGenerateBill: () => void;
    onGuestBill: () => void;
    onTakePayment: () => void;
    onViewPaidReceipt: () => void;
    onReopen: () => void;
};

export default function OrderPanel({
    activeTable,
    menuById,
    bill,
    itemCount,
    draftCount,
    isPaid,
    shareFeedback,
    canClear,
    canSendKitchen,
    canGenerateBill,
    canTakePayment,
    canReopen,
    canDeleteTickets,
    onClear,
    onAddGuest,
    onRenameGuest,
    onRemoveGuest,
    onChangeQuantity,
    onDeleteLine,
    onAssignGuest,
    onTipPreset,
    onCustomTipDollars,
    onServiceChargeEnabled,
    onServiceChargePercent,
    onSendKitchen,
    onGenerateBill,
    onGuestBill,
    onTakePayment,
    onViewPaidReceipt,
    onReopen,
}: Props) {
    const guestApproved = Boolean(activeTable.guestBillApprovedAt);

    return (
        <aside className="order-panel">
            <div className="order-title">
                <div>
                    <p className="eyebrow">Current order</p>
                    <h2>{activeTable.label}</h2>
                </div>
                {canClear && (
                    <button
                        className="clear-button"
                        type="button"
                        onClick={onClear}
                        disabled={!itemCount || isPaid}
                        aria-label="Clear order"
                    >
                        <Icon name="trash" />
                    </button>
                )}
            </div>
            <div className="order-meta">
                <span>
                    <Icon name="clock" /> {isPaid ? 'Paid' : 'Dine in'}
                </span>
                <span>
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
            </div>

            <div className="guest-bar">
                <div className="guest-bar-title">
                    <Icon name="users" />
                    <span>Split check</span>
                </div>
                <div className="guest-chips">
                    {activeTable.guests.map((guest) => (
                        <div className="guest-chip" key={guest.id}>
                            <input
                                value={guest.name}
                                onChange={(event) => onRenameGuest(guest.id, event.target.value)}
                                aria-label="Guest name"
                                disabled={isPaid}
                            />
                            {activeTable.guests.length > 1 && !isPaid && (
                                <button
                                    type="button"
                                    onClick={() => onRemoveGuest(guest.id)}
                                    aria-label={`Remove ${guest.name}`}
                                >
                                    ×
                                </button>
                            )}
                        </div>
                    ))}
                    {!isPaid && (
                        <button type="button" className="add-guest" onClick={onAddGuest}>
                            <Icon name="plus" /> Guest
                        </button>
                    )}
                </div>
            </div>

            <div className="order-list">
                {activeTable.lines.length ? (
                    activeTable.lines.map((line) => {
                        const item = menuById.get(line.menuItemId);
                        if (!item) return null;
                        return (
                            <div className="order-item" key={line.id}>
                                <div className="order-item-top">
                                    <div>
                                        <h3>{item.name}</h3>
                                        <p>
                                            <Price cents={unitPriceCents(item, line)} compact /> each ·{' '}
                                            {line.kitchenStatus}
                                            {line.orderNumber ? ` · #${line.orderNumber}` : ''}
                                        </p>
                                        {line.modifiers.length > 0 && (
                                            <p className="mod-line">
                                                {line.modifiers.map((mod) => mod.name).join(' · ')}
                                            </p>
                                        )}
                                        {line.note && <p className="mod-line">Note: {line.note}</p>}
                                    </div>
                                    <div className="order-item-aside">
                                        <Price cents={lineTotalCents(item, line)} />
                                        {!isPaid &&
                                            (line.kitchenStatus === 'draft' || canDeleteTickets) && (
                                            <button
                                                type="button"
                                                className="line-delete"
                                                aria-label={`Delete ${item.name}`}
                                                onClick={() => onDeleteLine(line.id)}
                                            >
                                                <Icon name="trash" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="order-item-controls">
                                    <div className="stepper" aria-label={`${item.name} quantity`}>
                                        <button
                                            type="button"
                                            onClick={() => onChangeQuantity(line.id, -1)}
                                            disabled={isPaid}
                                            aria-label={`Remove one ${item.name}`}
                                        >
                                            −
                                        </button>
                                        <span>{line.quantity}</span>
                                        <button
                                            type="button"
                                            onClick={() => onChangeQuantity(line.id, 1)}
                                            disabled={isPaid}
                                            aria-label={`Add one ${item.name}`}
                                        >
                                            +
                                        </button>
                                    </div>
                                    <label className="guest-assign">
                                        <span className="sr-only">Assign guest</span>
                                        <select
                                            value={line.guestId ?? ''}
                                            onChange={(event) =>
                                                onAssignGuest(line.id, event.target.value)
                                            }
                                            disabled={isPaid}
                                        >
                                            {activeTable.guests.map((guest) => (
                                                <option key={guest.id} value={guest.id}>
                                                    {guest.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="empty-order">
                        <span>
                            <Icon name="receipt" />
                        </span>
                        <h3>{isPaid ? 'Ready for the next party' : 'Your order is empty'}</h3>
                        <p>
                            {isPaid
                                ? 'Reopen this table to start a new bill.'
                                : 'Add a dish from the menu to begin.'}
                        </p>
                    </div>
                )}
            </div>

            <div className="billing-controls">
                <p className="billing-label">Tip (USD)</p>
                <div className="tip-presets" role="group" aria-label="Tip amount presets">
                    {TIP_AMOUNT_PRESETS.map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            className={activeTable.tipAmountPreset === preset ? 'active' : ''}
                            onClick={() => onTipPreset(preset)}
                            disabled={isPaid}
                        >
                            {moneyUsd(preset)}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={activeTable.tipAmountPreset === 'custom' ? 'active' : ''}
                        onClick={() => onTipPreset('custom')}
                        disabled={isPaid}
                    >
                        Custom
                    </button>
                </div>
                {activeTable.tipAmountPreset === 'custom' && (
                    <label className="custom-tip">
                        Custom tip ($)
                        <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={(activeTable.tipCents / 100).toFixed(2)}
                            disabled={isPaid}
                            onChange={(event) =>
                                onCustomTipDollars(Number(event.target.value || 0))
                            }
                        />
                    </label>
                )}
                <label className="tax-toggle">
                    <input
                        type="checkbox"
                        checked={activeTable.serviceChargeEnabled}
                        disabled={isPaid}
                        onChange={(event) => onServiceChargeEnabled(event.target.checked)}
                    />
                    Service Charge
                    <input
                        className="tax-input"
                        type="number"
                        min="0"
                        step="0.1"
                        value={activeTable.serviceChargePercent}
                        disabled={isPaid || !activeTable.serviceChargeEnabled}
                        onChange={(event) =>
                            onServiceChargePercent(Number(event.target.value || 0))
                        }
                        aria-label="Service charge percent"
                    />
                    %
                </label>
            </div>

            <div className="bill-summary">
                <div>
                    <span>Subtotal</span>
                    <Price cents={bill.subtotalCents} />
                </div>
                <div>
                    <span>
                        Service Charge
                        {activeTable.serviceChargeEnabled
                            ? ` (${activeTable.serviceChargePercent}%)`
                            : ''}
                    </span>
                    {activeTable.serviceChargeEnabled ? (
                        <Price cents={bill.serviceChargeCents} />
                    ) : (
                        <strong>—</strong>
                    )}
                </div>
                <div>
                    <span>
                        Tip (
                        {tipAmountLabel(activeTable.tipAmountPreset, activeTable.tipCents)})
                    </span>
                    <Price cents={bill.tipCents} />
                </div>
                <div className="total">
                    <span>Total</span>
                    <Price cents={bill.totalCents} />
                </div>
                <p className="fx-note">Shown in USD and XCG (1.80 XCG = 1 USD)</p>
            </div>

            {!isPaid ? (
                <>
                    {canSendKitchen && (
                        <button
                            className="secondary-button"
                            type="button"
                            disabled={!draftCount}
                            onClick={onSendKitchen}
                        >
                            <Icon name="chef" /> Send to kitchen
                            {draftCount > 0 && <span className="count-badge">{draftCount}</span>}
                        </button>
                    )}
                    {canGenerateBill && (
                        <button
                            className={`generate-button ${activeTable.billGeneratedAt ? 'ready' : ''}`}
                            type="button"
                            disabled={!itemCount}
                            onClick={onGenerateBill}
                        >
                            <Icon name={activeTable.billGeneratedAt ? 'check' : 'receipt'} />
                            {activeTable.billGeneratedAt ? 'View receipt' : 'Generate bill'}
                            {!activeTable.billGeneratedAt && (
                                <span>
                                    <Price cents={bill.totalCents} compact />
                                </span>
                            )}
                        </button>
                    )}
                    {canTakePayment && (
                        <div className="secondary-actions stacked-actions">
                            <button
                                type="button"
                                className="secondary-button"
                                disabled={!itemCount}
                                onClick={onGuestBill}
                            >
                                <Icon name="print" /> Guest bill / sign
                            </button>
                            <button
                                type="button"
                                className="secondary-button paid-button"
                                disabled={!itemCount || !guestApproved}
                                onClick={onTakePayment}
                                title={
                                    guestApproved
                                        ? 'Collect payment'
                                        : 'Guest must review & sign bill first'
                                }
                            >
                                <Icon name="check" /> Take payment
                            </button>
                            {!guestApproved && itemCount > 0 && (
                                <p className="pin-help">
                                    Print guest bill, get signature &amp; payment tick before collecting.
                                </p>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <>
                    {canGenerateBill && (
                        <button
                            className="generate-button ready"
                            type="button"
                            onClick={onViewPaidReceipt}
                        >
                            <Icon name="receipt" /> View paid receipt
                        </button>
                    )}
                    {canReopen && (
                        <button type="button" className="secondary-button" onClick={onReopen}>
                            <Icon name="lock" /> Reopen table
                        </button>
                    )}
                </>
            )}
            {shareFeedback && (
                <div className="bill-message" role="status">
                    <strong>{shareFeedback}</strong>
                </div>
            )}
        </aside>
    );
}
