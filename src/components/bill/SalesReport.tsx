import { Icon } from './Icons';
import Price from './Price';
import type { PosSettings, SaleRecord } from './types';
import { summarizeSales, summarizeSalesByStation } from './math';

type OwnerOps = {
    openTables?: number;
    saleCount?: number;
    recentBackups?: string[];
    status?: string;
};

type Props = {
    sales: SaleRecord[];
    settings: PosSettings;
    canDeletePayments: boolean;
    serverMode?: boolean;
    ownerOps?: OwnerOps | null;
    onExport: () => void;
    onDeleteSale: (saleId: string) => void;
    onOpenShift: () => void;
    onCloseShift: () => void;
    onBackup?: () => void;
};

export default function SalesReport({
    sales,
    settings,
    canDeletePayments,
    serverMode = false,
    ownerOps = null,
    onExport,
    onDeleteSale,
    onOpenShift,
    onCloseShift,
    onBackup,
}: Props) {
    const summary = summarizeSales(sales);
    const stations = summarizeSalesByStation(sales);
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
                    {serverMode && onBackup && canDeletePayments && (
                        <button type="button" className="secondary-button" onClick={onBackup}>
                            <Icon name="download" /> Backup DB
                        </button>
                    )}
                </div>
            </div>
            {serverMode && ownerOps && (
                <div className="owner-ops-banner">
                    <p>
                        Owner ops · {ownerOps.openTables ?? 0} open tables · ledger{' '}
                        {ownerOps.saleCount ?? 0} sales
                        {ownerOps.recentBackups?.length
                            ? ` · last backup ${ownerOps.recentBackups[0]}`
                            : ' · no server backup yet'}
                    </p>
                </div>
            )}
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
                        {!shiftOpen && settings.shiftClosedAt
                            ? ' · payments blocked until you open a shift'
                            : ''}
                    </p>
                )}
            </div>

            <div className="station-daypart" aria-label="Station day-part summary">
                <p className="billing-label">Station day-part</p>
                <div className="report-stats station-stats">
                    <div>
                        <span>Floor checks</span>
                        <strong>{stations.floor.count}</strong>
                        <small>
                            <Price cents={stations.floor.totalCents} compact /> · tips{' '}
                            <Price cents={stations.floor.tipCents} compact />
                        </small>
                    </div>
                    <div>
                        <span>Bar checks</span>
                        <strong>{stations.bar.count}</strong>
                        <small>
                            <Price cents={stations.bar.totalCents} compact /> · tips{' '}
                            <Price cents={stations.bar.tipCents} compact />
                        </small>
                    </div>
                    <div>
                        <span>Floor comps</span>
                        <strong>
                            <Price cents={stations.floor.compCents} compact />
                        </strong>
                    </div>
                    <div>
                        <span>Bar comps</span>
                        <strong>
                            <Price cents={stations.bar.compCents} compact />
                        </strong>
                    </div>
                </div>
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
                    <span>Comps</span>
                    <strong>
                        <Price cents={summary.compCents} compact />
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
