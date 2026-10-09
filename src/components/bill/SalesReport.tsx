import { Icon } from './Icons';
import Price from './Price';
import type { PosSettings, SaleRecord } from './types';
import { summarizeSales } from './math';

type Props = {
    sales: SaleRecord[];
    settings: PosSettings;
    canDeletePayments: boolean;
    onExport: () => void;
    onDeleteSale: (saleId: string) => void;
    onOpenShift: () => void;
    onCloseShift: () => void;
};

export default function SalesReport({
    sales,
    settings,
    canDeletePayments,
    onExport,
    onDeleteSale,
    onOpenShift,
    onCloseShift,
}: Props) {
    const summary = summarizeSales(sales);
    const shiftOpen = Boolean(settings.shiftOpenedAt && !settings.shiftClosedAt);

    return (
        <section className="menu-panel reports-panel">
            <div className="menu-heading">
                <div>
                    <p className="eyebrow">End of day</p>
                    <h1>Daily sales</h1>
                </div>
                <div className="report-heading-actions">
                    {shiftOpen ? (
                        <button type="button" className="secondary-button" onClick={onCloseShift}>
                            Close shift
                        </button>
                    ) : (
                        <button type="button" className="secondary-button" onClick={onOpenShift}>
                            Open shift
                        </button>
                    )}
                    <button type="button" className="secondary-button" onClick={onExport}>
                        <Icon name="download" /> Export CSV
                    </button>
                </div>
            </div>
            <div className={`shift-banner ${shiftOpen ? 'open' : 'closed'}`}>
                {shiftOpen ? (
                    <p>
                        Shift open since{' '}
                        {new Date(settings.shiftOpenedAt as string).toLocaleString()}
                    </p>
                ) : (
                    <p>
                        Shift closed
                        {settings.shiftClosedAt
                            ? ` · ${new Date(settings.shiftClosedAt).toLocaleString()}`
                            : ''}
                    </p>
                )}
            </div>
            <div className="report-stats">
                <div>
                    <span>Checks</span>
                    <strong>{summary.count}</strong>
                </div>
                <div>
                    <span>Items</span>
                    <strong>{summary.itemCount}</strong>
                </div>
                <div>
                    <span>Service Charge</span>
                    <strong>
                        <Price cents={summary.serviceChargeCents} compact />
                    </strong>
                </div>
                <div>
                    <span>Tips</span>
                    <strong>
                        <Price cents={summary.tipCents} compact />
                    </strong>
                </div>
                <div>
                    <span>Cash net</span>
                    <strong>
                        <Price cents={summary.cashCents} compact />
                    </strong>
                </div>
                <div>
                    <span>Card</span>
                    <strong>
                        <Price cents={summary.cardCents} compact />
                    </strong>
                </div>
                <div className="wide">
                    <span>Total sales</span>
                    <strong>
                        <Price cents={summary.totalCents} compact />
                    </strong>
                </div>
            </div>
            <div className="sales-table">
                <div className={`sales-row head ${canDeletePayments ? 'with-actions' : ''}`}>
                    <span>Time</span>
                    <span>Table</span>
                    <span>Server</span>
                    <span>Method</span>
                    <span>Total</span>
                    {canDeletePayments && <span>Actions</span>}
                </div>
                {sales.length === 0 && <p className="empty-menu">No paid checks yet today.</p>}
                {sales.map((sale) => (
                    <div
                        className={`sales-row ${canDeletePayments ? 'with-actions' : ''}`}
                        key={sale.id}
                    >
                        <span>{new Date(sale.paidAt).toLocaleTimeString()}</span>
                        <span>
                            {sale.tableLabel}
                            {sale.guestName ? ` · ${sale.guestName}` : ''}
                            {sale.orderNumbers?.length
                                ? ` · ${sale.orderNumbers.join(', ')}`
                                : ''}
                        </span>
                        <span>{sale.serverName}</span>
                        <span>{sale.payment.method}</span>
                        <span>
                            <Price cents={sale.totalCents} compact />
                        </span>
                        {canDeletePayments && (
                            <span>
                                <button
                                    type="button"
                                    className="ghost-text danger-text"
                                    onClick={() => onDeleteSale(sale.id)}
                                >
                                    Delete
                                </button>
                            </span>
                        )}
                    </div>
                ))}
            </div>
            {!canDeletePayments && (
                <p className="pin-help">Only a Manager can delete payments.</p>
            )}
            <p className="fx-note">
                FX: {settings.xcgPerUsd.toFixed(2)} XCG = 1 USD · amounts stored in USD
            </p>
        </section>
    );
}
