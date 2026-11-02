import { Icon } from './Icons';
import { encodeSnapshot, formatDual, moneyUsd, moneyXcg } from './math';
import { COURSE_FIRE_LABELS, type BillSnapshot, type ReceiptTemplate } from './types';

type Props = {
    snapshot: BillSnapshot;
    onClose: () => void;
    shareFeedback: string | null;
    onShareFeedback: (message: string) => void;
    onTemplateChange?: (template: ReceiptTemplate) => void;
};

const TEMPLATE_LABELS: Record<ReceiptTemplate, string> = {
    guest: 'Guest',
    kitchen: 'Kitchen',
    paid: 'Paid',
};

export default function ReceiptView({
    snapshot,
    onClose,
    shareFeedback,
    onShareFeedback,
    onTemplateChange,
}: Props) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(snapshot.restaurant.feedbackUrl)}`;
    const template = snapshot.template ?? 'guest';
    const isKitchen = template === 'kitchen';

    const printReceipt = () => window.print();

    const downloadReceipt = () => {
        const lines = [
            snapshot.restaurant.name,
            snapshot.restaurant.address,
            snapshot.restaurant.phone,
            `Tax ID: ${snapshot.restaurant.taxId}`,
            snapshot.tableLabel,
            `Server: ${snapshot.serverName}`,
            `Template: ${TEMPLATE_LABELS[template]}`,
            snapshot.orderNumbers.length
                ? `Orders: ${snapshot.orderNumbers.join(', ')}`
                : null,
            `Generated: ${new Date(snapshot.generatedAt).toLocaleString()}`,
            `Status: ${snapshot.status}`,
            isKitchen ? null : 'FX: 1.80 XCG = 1 USD',
            '',
            ...snapshot.items.map((item) => {
                const mods = item.modifiers.length ? ` [${item.modifiers.join(', ')}]` : '';
                const note = item.note ? ` — ${item.note}` : '';
                const ord = item.orderNumber ? ` #${item.orderNumber}` : '';
                const course =
                    item.courseFire && isKitchen
                        ? ` (${COURSE_FIRE_LABELS[item.courseFire]})`
                        : '';
                const status = item.kitchenStatus && isKitchen ? ` [${item.kitchenStatus}]` : '';
                const price = isKitchen ? '' : `  ${formatDual(item.lineTotalCents)}`;
                return `${item.quantity}x ${item.name}${ord}${course}${status}${mods}${note}${item.guestName ? ` (${item.guestName})` : ''}${price}`;
            }),
        ].filter((line): line is string => line !== null);

        if (!isKitchen) {
            lines.push(
                '',
                `Subtotal: ${formatDual(snapshot.subtotalCents)}`,
                snapshot.serviceChargeEnabled
                    ? `Service Charge (${snapshot.serviceChargePercent}%): ${formatDual(snapshot.serviceChargeCents)}`
                    : 'Service Charge: —',
                `Tip: ${formatDual(snapshot.tipCents)}`,
                `Total: ${formatDual(snapshot.totalCents)}`,
            );
        }
        if (snapshot.payment) {
            lines.push(
                '',
                `Paid via ${snapshot.payment.method}`,
                `Cash: ${formatDual(snapshot.payment.cashCents)}`,
                `Card: ${formatDual(snapshot.payment.cardCents)}`,
                `Change: ${formatDual(snapshot.payment.changeDueCents)}`,
            );
        }
        if (snapshot.guestPreferredPayment) {
            lines.push(`Guest payment preference: ${snapshot.guestPreferredPayment}`);
        }
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${snapshot.tableLabel.replace(/\s+/g, '-').toLowerCase()}-${template}-receipt.txt`;
        anchor.click();
        URL.revokeObjectURL(url);
        onShareFeedback('Receipt downloaded. Use Print / PDF for a PDF copy.');
    };

    const shareReceipt = async () => {
        const url = `${window.location.origin}${window.location.pathname}#bill=${encodeSnapshot(snapshot)}`;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: `${snapshot.restaurant.name} — ${snapshot.tableLabel}`,
                    text: isKitchen
                        ? `Kitchen ticket ${snapshot.tableLabel}`
                        : `Bill total ${formatDual(snapshot.totalCents)}`,
                    url,
                });
                onShareFeedback('Share sheet opened.');
            } else {
                await navigator.clipboard.writeText(url);
                onShareFeedback('Shareable bill link copied.');
            }
        } catch {
            try {
                await navigator.clipboard.writeText(url);
                onShareFeedback('Shareable bill link copied.');
            } catch {
                onShareFeedback('Could not share this bill automatically.');
            }
        }
    };

    return (
        <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Receipt">
            <div className={`receipt-sheet template-${template}`}>
                <div className="receipt-toolbar no-print">
                    <div>
                        <p className="eyebrow">{TEMPLATE_LABELS[template]} receipt</p>
                        <h2>{snapshot.tableLabel}</h2>
                    </div>
                    <div className="receipt-actions">
                        {onTemplateChange && (
                            <div className="tip-presets receipt-template-toggle" role="group">
                                {(['guest', 'kitchen', 'paid'] as ReceiptTemplate[]).map((key) => (
                                    <button
                                        key={key}
                                        type="button"
                                        className={template === key ? 'active' : ''}
                                        onClick={() => onTemplateChange(key)}
                                    >
                                        {TEMPLATE_LABELS[key]}
                                    </button>
                                ))}
                            </div>
                        )}
                        <button type="button" onClick={printReceipt}>
                            <Icon name="print" /> Print / PDF
                        </button>
                        <button type="button" onClick={downloadReceipt}>
                            <Icon name="download" /> Download
                        </button>
                        <button type="button" onClick={shareReceipt}>
                            <Icon name="share" /> Share link
                        </button>
                        <button type="button" className="ghost" onClick={onClose} aria-label="Close receipt">
                            <Icon name="close" />
                        </button>
                    </div>
                </div>
                {shareFeedback && <p className="share-feedback no-print">{shareFeedback}</p>}
                <div className="receipt-body" id="printable-receipt">
                    <header className="receipt-brand">
                        <div className="receipt-logo">S</div>
                        <strong>{snapshot.restaurant.name}</strong>
                        <span>{snapshot.restaurant.tagline}</span>
                        {!isKitchen && (
                            <>
                                <span>{snapshot.restaurant.address}</span>
                                <span>
                                    {snapshot.restaurant.phone} · Tax ID {snapshot.restaurant.taxId}
                                </span>
                            </>
                        )}
                        <span>
                            {snapshot.tableLabel} · Server {snapshot.serverName}
                        </span>
                        {snapshot.orderNumbers.length > 0 && (
                            <span>Orders: {snapshot.orderNumbers.join(', ')}</span>
                        )}
                        <span>{new Date(snapshot.generatedAt).toLocaleString()}</span>
                        <span className={`status-chip ${snapshot.status}`}>{snapshot.status}</span>
                        {!isKitchen && <span>FX rate: 1.80 XCG = 1 USD</span>}
                        {isKitchen && <span className="kitchen-chit-label">Kitchen chit — no prices</span>}
                    </header>
                    <ul>
                        {snapshot.items.map((item, index) => (
                            <li key={`${item.name}-${index}`}>
                                <div>
                                    <strong>
                                        {item.quantity}× {item.name}
                                    </strong>
                                    {item.orderNumber && <small>#{item.orderNumber}</small>}
                                    {isKitchen && item.courseFire && (
                                        <small>{COURSE_FIRE_LABELS[item.courseFire]}</small>
                                    )}
                                    {isKitchen && item.kitchenStatus && (
                                        <small>{item.kitchenStatus}</small>
                                    )}
                                    {item.modifiers.length > 0 && (
                                        <small>{item.modifiers.join(' · ')}</small>
                                    )}
                                    {item.note && <small>Note: {item.note}</small>}
                                    {item.guestName && <small>{item.guestName}</small>}
                                </div>
                                {!isKitchen && (
                                    <span className="price-dual compact">
                                        <strong>{moneyUsd(item.lineTotalCents)}</strong>
                                        <small>{moneyXcg(item.lineTotalCents)}</small>
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                    {!isKitchen && (
                        <div className="receipt-totals">
                            <div>
                                <span>Subtotal</span>
                                <strong>{formatDual(snapshot.subtotalCents)}</strong>
                            </div>
                            <div>
                                <span>
                                    {snapshot.serviceChargeEnabled
                                        ? `Service Charge (${snapshot.serviceChargePercent}%)`
                                        : 'Service Charge'}
                                </span>
                                <strong>
                                    {snapshot.serviceChargeEnabled
                                        ? formatDual(snapshot.serviceChargeCents)
                                        : '—'}
                                </strong>
                            </div>
                            <div>
                                <span>Tip</span>
                                <strong>{formatDual(snapshot.tipCents)}</strong>
                            </div>
                            <div className="grand">
                                <span>Total</span>
                                <strong>{formatDual(snapshot.totalCents)}</strong>
                            </div>
                        </div>
                    )}
                    {snapshot.payment && (
                        <div className="split-block">
                            <p>Payment</p>
                            <div>
                                <span>Method</span>
                                <strong>{snapshot.payment.method}</strong>
                            </div>
                            <div>
                                <span>Cash tendered</span>
                                <strong>{formatDual(snapshot.payment.cashCents)}</strong>
                            </div>
                            <div>
                                <span>Card</span>
                                <strong>{formatDual(snapshot.payment.cardCents)}</strong>
                            </div>
                            <div>
                                <span>Change due</span>
                                <strong>{formatDual(snapshot.payment.changeDueCents)}</strong>
                            </div>
                        </div>
                    )}
                    {snapshot.guestSignatureDataUrl && !isKitchen && (
                        <div className="split-block">
                            <p>Guest approval</p>
                            <img
                                className="receipt-signature"
                                src={snapshot.guestSignatureDataUrl}
                                alt="Guest signature"
                            />
                            {snapshot.guestPreferredPayment && (
                                <div>
                                    <span>Preferred payment</span>
                                    <strong>{snapshot.guestPreferredPayment}</strong>
                                </div>
                            )}
                        </div>
                    )}
                    {snapshot.guests.filter((guest) => guest.subtotalCents > 0).length > 1 &&
                        !isKitchen && (
                            <div className="split-block">
                                <p>Split check</p>
                                {snapshot.guests
                                    .filter((guest) => guest.subtotalCents > 0)
                                    .map((guest) => (
                                        <div key={guest.id}>
                                            <span>
                                                {guest.name}
                                                {guest.paidAt ? ' · paid' : ''}
                                            </span>
                                            <strong>{formatDual(guest.totalCents)}</strong>
                                        </div>
                                    ))}
                            </div>
                        )}
                    {!isKitchen && (
                        <div className="receipt-qr">
                            <img src={qrUrl} alt="Feedback QR code" width={140} height={140} />
                            <div>
                                <strong>Scan for feedback</strong>
                                <span>{snapshot.restaurant.feedbackUrl}</span>
                            </div>
                        </div>
                    )}
                    <footer>
                        {isKitchen
                            ? 'Expo copy — fire when ready.'
                            : 'Thank you for dining with us.'}
                    </footer>
                </div>
            </div>
        </div>
    );
}
