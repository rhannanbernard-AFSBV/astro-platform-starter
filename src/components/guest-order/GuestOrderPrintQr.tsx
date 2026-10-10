import { useMemo, useState } from 'react';
import GuestOrderHeroQr from './GuestOrderHeroQr';
import { readTableFromSearch } from './guestOrderUrl';
import './guest-order-print-qr.css';

const TABLE_PRESETS = ['1', '2', '3', '4', '5', '6', '8', '10', '12', '14', '16', '20'];

export default function GuestOrderPrintQr() {
    const year = useMemo(() => new Date().getFullYear(), []);
    const initial = useMemo(() => readTableFromSearch(), []);
    const [table, setTable] = useState(initial);

    return (
        <div className="guest-print-qr">
            <header className="guest-print-qr-head">
                <span className="guest-print-mark" aria-hidden="true">
                    A
                </span>
                <div>
                    <h1>Authentic Jamaican</h1>
                    <p>Cuisine &amp; Bar · Front Street, Philipsburg</p>
                </div>
            </header>
            <p className="guest-print-lead">
                Scan with your phone — order in USD or XCG, then pay at the counter.
            </p>

            <div className="guest-print-table-pick no-print">
                <label>
                    Table number for this tent
                    <input
                        value={table}
                        onChange={(e) => setTable(e.target.value.replace(/[^\w\s-]/g, '').slice(0, 12))}
                        placeholder="e.g. 12"
                        inputMode="numeric"
                    />
                </label>
                <div className="guest-print-presets">
                    {TABLE_PRESETS.map((n) => (
                        <button key={n} type="button" onClick={() => setTable(n)}>
                            {n}
                        </button>
                    ))}
                    <button type="button" onClick={() => setTable('')}>
                        General
                    </button>
                </div>
            </div>

            {table ? <p className="guest-print-table-banner">Table {table}</p> : null}

            <GuestOrderHeroQr sizePx={320} className="guest-print-qr-block" table={table || undefined} />
            <ol className="guest-print-steps">
                <li>Scan the QR code</li>
                <li>Order for your table or pickup</li>
                <li>Pay at the counter in <strong>USD or XCG</strong></li>
                <li>
                    Optional: <strong>Add to Home Screen</strong> for next visit
                </li>
            </ol>
            <footer className="guest-print-foot">
                <a href={table ? `/order?table=${encodeURIComponent(table)}` : '/order'}>
                    Open order page
                </a>
                <button type="button" className="guest-print-btn no-print" onClick={() => window.print()}>
                    Print table tent
                </button>
                <span>© {year} Authentic Jamaican · Philipsburg, Sint Maarten</span>
            </footer>
        </div>
    );
}
