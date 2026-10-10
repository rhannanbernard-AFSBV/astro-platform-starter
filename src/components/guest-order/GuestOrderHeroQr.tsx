import { useMemo } from 'react';
import { getGuestOrderUrl, guestOrderQrImageUrl } from './guestOrderUrl';

type Props = {
    sizePx?: number;
    className?: string;
    /** When set, QR deep-links to /order?table=N for that table tent. */
    table?: string;
};

export default function GuestOrderHeroQr({
    sizePx = 132,
    className = 'guest-hero-qr',
    table,
}: Props) {
    const orderUrl = useMemo(() => getGuestOrderUrl(undefined, { table }), [table]);
    const qrSrc = useMemo(() => guestOrderQrImageUrl(orderUrl, sizePx), [orderUrl, sizePx]);

    return (
        <div className={className} aria-label="Scan to open guest order">
            <img
                src={qrSrc}
                width={sizePx}
                height={sizePx}
                alt=""
                className="guest-qr-img"
                decoding="async"
            />
            <div className="guest-qr-copy">
                <strong>{table ? `Table ${table} · Scan to order` : 'Scan to order'}</strong>
                <span>Add to Home Screen to install the app · USD &amp; XCG</span>
                <code className="guest-qr-url">{orderUrl}</code>
            </div>
        </div>
    );
}
