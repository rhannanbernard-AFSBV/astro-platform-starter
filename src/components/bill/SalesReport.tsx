import { Icon } from './Icons';
import Price from './Price';
import type { SaleRecord } from './types';
import { summarizeSales } from './math';

type Props = {
    sales: SaleRecord[];
    onExport: () => void;
};

export default function SalesReport({ sales, onExport }: Props) {
    const summary = summarizeSales(sales);

    return (
        <section className="menu-panel reports-panel">
            <div className="menu-heading">
                <div>
                    <p className="eyebrow">End of day</p>
                    <h1>Daily sales</h1>
                </div>
                <button type="button" className="secondary-button" onClick={onExport}>
                    <Icon name="download" /> Export CSV
                </button>
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
                    <span>Tax</span>
                    <strong>
                        <Price cents={summary.taxCents} compact />
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
                <div className="sales-row head">
                    <span>Time</span>
                    <span>Table</span>
                    <span>Server</span>
                    <span>Method</span>
                    <span>Total</span>
                </div>
                {sales.length === 0 && <p className="empty-menu">No paid checks yet today.</p>}
                {sales.map((sale) => (
                    <div className="sales-row" key={sale.id}>
                        <span>{new Date(sale.paidAt).toLocaleTimeString()}</span>
                        <span>{sale.tableLabel}</span>
                        <span>{sale.serverName}</span>
                        <span>{sale.payment.method}</span>
                        <span>
                            <Price cents={sale.totalCents} compact />
                        </span>
                    </div>
                ))}
            </div>
            <p className="fx-note">FX: 1.80 XCG = 1 USD · amounts stored in USD, shown in both currencies</p>
        </section>
    );
}
