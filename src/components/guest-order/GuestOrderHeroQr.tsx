import { useMemo } from 'react';
import { getGuestOrderUrl, guestOrderQrImageUrl } from './guestOrderUrl';

type Props = {
    /** Smaller QR under the hero CTA; printable page uses a larger size. */
    sizePx?: number;
    className?: string;
};

export default function GuestOrderHeroQr({ sizePx = 132, className = 'guest-hero-qr' }: Props) {
    const orderUrl = useMemo(() => getGuestOrderUrl(), []);
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
                <strong>Scan to order</strong>
                <span>Add to Home Screen to install the app</span>
                <code className="guest-qr-url">{orderUrl}</code>
            </div>
        </div>
    );
}
