import { Icon } from './Icons';
import Price from './Price';
import { lineTotalCents, moneyUsd, tipAmountLabel, unitPriceCents, type BillResult } from './math';
import StatusTabs, { StatusChip } from './StatusTabs';
import {
    isBeverageItem,
    nextServiceStatus,
    type ActiveKitchenStatus,
} from './statusUi';
import {
    COURSE_FIRE_LABELS,
    COURSE_FIRE_OPTIONS,
    TIP_AMOUNT_PRESETS,
    type CourseFire,
    type KitchenStatus,
    type MenuItem,
    type TableOrder,
    type TipAmountPreset,
} from './types';

type Props = {
    activeTable: TableOrder;
    menuById: Map<string, MenuItem>;
    bill: BillResult;
    itemCount: number;
    draftCount: number;
    isPaid: boolean;
    isPartial: boolean;
    shareFeedback: string | null;
    canClear: boolean;
    canSendKitchen: boolean;
    canGenerateBill: boolean;
    canTakePayment: boolean;
    canReopen: boolean;
    canDeleteTickets: boolean;
    canUpdateBeverageStatus: boolean;
    flashLineIds?: string[];
    onClear: () => void;
    onAddGuest: () => void;
    onRenameGuest: (guestId: string, name: string) => void;
    onRemoveGuest: (guestId: string) => void;
    onChangeQuantity: (lineId: string, change: number) => void;
    onDeleteLine: (lineId: string) => void;
    onAssignGuest: (lineId: string, guestId: string) => void;
    onCourseFire: (lineId: string, courseFire: CourseFire) => void;
    onTipPreset: (preset: TipAmountPreset) => void;
    onCustomTipDollars: (value: number) => void;
    onServiceChargeEnabled: (enabled: boolean) => void;
    onServiceChargePercent: (value: number) => void;
    onBeverageStatus: (lineId: string, status: KitchenStatus) => void;
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
    isPartial,
    shareFeedback,
    canClear,
    canSendKitchen,
    canGenerateBill,
    canTakePayment,
    canReopen,
    canDeleteTickets,
    canUpdateBeverageStatus,
    flashLineIds = [],
    onClear,
    onAddGuest,
    onRenameGuest,
    onRemoveGuest,
    onChangeQuantity,
    onDeleteLine,
    onAssignGuest,
    onCourseFire,
    onTipPreset,
    onCustomTipDollars,
    onServiceChargeEnabled,
    onServiceChargePercent,
    onBeverageStatus,
    onSendKitchen,
    onGenerateBill,
    onGuestBill,
    onTakePayment,
    onViewPaidReceipt,
    onReopen,
}: Props) {
    const guestApproved = Boolean(activeTable.guestBillApprovedAt);
    const guestTicketReady = Boolean(activeTable.billGeneratedAt);
    const locked = isPaid;

    const statusCounts = activeTable.lines.reduce(
        (acc, line) => {
            const status = line.kitchenStatus;
            if (
                status === 'queued' ||
                status === 'preparing' ||
                status === 'ready' ||
                status === 'served'
            ) {
                acc[status] = (acc[status] ?? 0) + 1;
            }
            return acc;
        },
        {} as Partial<Record<ActiveKitchenStatus, number>>,
    );

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
                    <Icon name="clock" />{' '}
                    {isPaid ? 'Paid' : isPartial ? 'Partial pay' : 'Dine in'}
                </span>
                <span>
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                </span>
            </div>

            <StatusTabs active="all" counts={statusCounts} showAll={false} />

            <div className="guest-bar">
                <div className="guest-bar-title">
                    <Icon name="users" />
                    <span>Split check</span>
                </div>
                <div className="guest-chips">
                    {activeTable.guests.map((guest) => {
                        const guestBill = bill.guestBreakdown.find((entry) => entry.id === guest.id);
                        return (
                            <div
                                className={`guest-chip${guest.paidAt ? ' guest-paid' : ''}`}
                                key={guest.id}
                            >
                                <input
                                    value={guest.name}
                                    onChange={(event) =>
                                        onRenameGuest(guest.id, event.target.value)
                                    }
                                    aria-label="Guest name"
                                    disabled={locked || Boolean(guest.paidAt)}
                                />
                                {guest.paidAt ? (
                                    <span className="guest-paid-tag">Paid</span>
                                ) : guestBill && guestBill.totalCents > 0 ? (
                                    <span className="guest-due-tag">
                                        ${(guestBill.totalCents / 100).toFixed(2)}
                                    </span>
                                ) : null}
                                {activeTable.guests.length > 1 && !locked && !guest.paidAt && (
                                    <button
                                        type="button"
                                        onClick={() => onRemoveGuest(guest.id)}
                                        aria-label={`Remove ${guest.name}`}
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    {!locked && (
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
                        const beverage = isBeverageItem(item);
                        const next = nextServiceStatus(line.kitchenStatus);
                        const canAdvanceBeverage =
                            beverage &&
                            canUpdateBeverageStatus &&
                            guestTicketReady &&
                            !isPaid &&
                            line.kitchenStatus !== 'draft' &&
                            Boolean(next);

                        return (
                            <div
                                className={`order-item ${beverage ? 'beverage-line' : ''} status-${line.kitchenStatus} ${flashLineIds.includes(line.id) ? 'ready-flash' : ''}`}
                                key={line.id}
                            >
                                <div className="order-item-top">
                                    <div>
                                        <h3>
                                            {item.name}
                                            {beverage && (
                                                <span className="bev-tag">Beverage</span>
                                            )}
                                        </h3>
                                        <p>
                                            <Price cents={unitPriceCents(item, line)} compact /> each
                                            {line.orderNumber ? ` · #${line.orderNumber}` : ''}
                                            {beverage && line.kitchenStatus === 'draft'
                                                ? ' · held for guest ticket'
                                                : ''}
                                        </p>
                                        <StatusChip status={line.kitchenStatus} />
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
                                            disabled={locked}
                                        >
                                            {activeTable.guests.map((guest) => (
                                                <option key={guest.id} value={guest.id}>
                                                    {guest.name}
                                                    {guest.paidAt ? ' · paid' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                                {!beverage && !locked && (
                                    <div
                                        className="course-filter compact"
                                        role="group"
                                        aria-label="Course fire"
                                    >
                                        {COURSE_FIRE_OPTIONS.map((course) => (
                                            <button
                                                key={course}
                                                type="button"
                                                className={
                                                    line.courseFire === course ? 'active' : ''
                                                }
                                                onClick={() => onCourseFire(line.id, course)}
                                                disabled={line.kitchenStatus === 'served'}
                                            >
                                                {COURSE_FIRE_LABELS[course]}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                {canAdvanceBeverage && next && (
                                    <div className="beverage-status-actions">
                                        <button
                                            type="button"
                                            className={`bev-advance status-tab-${next}`}
                                            onClick={() => onBeverageStatus(line.id, next)}
                                        >
                                            Mark {next}
                                        </button>
                                    </div>
                                )}
                                {beverage && !guestTicketReady && line.kitchenStatus === 'draft' && (
                                    <p className="pin-help bev-help">
                                        Beverages stay with the server — generate a guest ticket to
                                        queue and update status.
                                    </p>
                                )}
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
                        Tip ({tipAmountLabel(activeTable.tipAmountPreset, activeTable.tipCents)})
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
                            <Icon name="chef" /> Send food to kitchen
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
                                <Icon name="check" />{' '}
                                {isPartial ? 'Pay remaining guests' : 'Take payment'}
                            </button>
                            {!guestApproved && itemCount > 0 && (
                                <p className="pin-help">
                                    Print guest bill, get signature &amp; payment tick before
                                    collecting. Then pay per guest or settle the full table.
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
