import { useMemo } from 'react';
import GuestOrderHeroQr from './GuestOrderHeroQr';
import './guest-order-print-qr.css';

export default function GuestOrderPrintQr() {
    const year = useMemo(() => new Date().getFullYear(), []);

    return (
        <div className="guest-print-qr">
            <header className="guest-print-qr-head">
                <span className="guest-print-mark" aria-hidden="true">
                    A
                </span>
                <div>
                    <h1>Authentic Jamaican</h1>
                    <p>Cuisine &amp; Bar · Philipsburg</p>
                </div>
            </header>
            <p className="guest-print-lead">Scan with your phone camera to order or install our guest app.</p>
            <GuestOrderHeroQr sizePx={320} className="guest-print-qr-block" />
            <ol className="guest-print-steps">
                <li>Scan the QR code</li>
                <li>Open the link in your browser</li>
                <li>Use <strong>Add to Home Screen</strong> (iPhone/Android) for quick access</li>
            </ol>
            <footer className="guest-print-foot">
                <a href="/order">Open order page</a>
                <span>© {year} Authentic Jamaican</span>
            </footer>
        </div>
    );
}
