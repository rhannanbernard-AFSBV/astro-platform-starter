import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import { formatDual, moneyUsd, moneyXcg } from './math';
import type { BillSnapshot, PaymentMethod } from './types';

type Props = {
    snapshot: BillSnapshot;
    preferredPayment: PaymentMethod | null;
    signatureDataUrl: string | null;
    onPreferredPayment: (method: PaymentMethod) => void;
    onSignature: (dataUrl: string | null) => void;
    onApproveAndCollect: () => void;
    onCancel: () => void;
};

type Point = { x: number; y: number };

export default function GuestBillModal({
    snapshot,
    preferredPayment,
    signatureDataUrl,
    onPreferredPayment,
    onSignature,
    onApproveAndCollect,
    onCancel,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawing = useRef(false);
    const primed = useRef(false);
    const [hasStroke, setHasStroke] = useState(Boolean(signatureDataUrl));

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || primed.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const ratio = window.devicePixelRatio || 1;
        const width = Math.max(canvas.clientWidth, 280);
        const height = Math.max(canvas.clientHeight, 140);
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#1a1a1a';
        primed.current = true;
        if (signatureDataUrl) {
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0, width, height);
            img.src = signatureDataUrl;
            setHasStroke(true);
        }
    }, [signatureDataUrl]);

    const pointFromEvent = (event: { clientX: number; clientY: number }): Point => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const beginStroke = (point: Point) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        drawing.current = true;
        ctx.beginPath();
        ctx.moveTo(point.x, point.y);
    };

    const continueStroke = (point: Point) => {
        if (!drawing.current) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        setHasStroke(true);
    };

    const finishStroke = () => {
        if (!drawing.current) return;
        drawing.current = false;
        const canvas = canvasRef.current;
        if (canvas) onSignature(canvas.toDataURL('image/png'));
    };

    const clearSignature = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        setHasStroke(false);
        onSignature(null);
    };

    const printBill = () => window.print();
    const signed = hasStroke || Boolean(signatureDataUrl);
    const canCollect = Boolean(preferredPayment && signed);

    const handleApprove = () => {
        if (!preferredPayment || !signed) return;
        const canvas = canvasRef.current;
        if (canvas && hasStroke) {
            onSignature(canvas.toDataURL('image/png'));
        }
        onApproveAndCollect();
    };

    return (
        <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Guest bill review">
            <div className="receipt-sheet guest-bill-sheet">
                <div className="receipt-toolbar no-print">
                    <div>
                        <p className="eyebrow">Guest bill</p>
                        <h2>{snapshot.tableLabel}</h2>
                        <p className="fx-note">Review · sign · choose payment · then collect</p>
                    </div>
                    <div className="receipt-actions">
                        <button type="button" onClick={printBill}>
                            <Icon name="print" /> Print for guest
                        </button>
                        <button type="button" className="ghost" onClick={onCancel} aria-label="Cancel guest bill">
                            <Icon name="close" />
                        </button>
                    </div>
                </div>

                <div className="receipt-body guest-bill-body" id="printable-guest-bill">
                    <header className="receipt-brand">
                        <div className="receipt-logo">S</div>
                        <strong>{snapshot.restaurant.name}</strong>
                        <span>{snapshot.restaurant.tagline}</span>
                        <span>{snapshot.restaurant.address}</span>
                        <span>
                            {snapshot.tableLabel} · Server {snapshot.serverName}
                        </span>
                        {snapshot.orderNumbers.length > 0 && (
                            <span>Orders: {snapshot.orderNumbers.join(', ')}</span>
                        )}
                        <span>{new Date(snapshot.generatedAt).toLocaleString()}</span>
                    </header>

                    <ul>
                        {snapshot.items.map((item, index) => (
                            <li key={`${item.name}-${index}`}>
                                <div>
                                    <strong>
                                        {item.quantity}× {item.name}
                                    </strong>
                                    {item.orderNumber && <small>#{item.orderNumber}</small>}
                                    {item.modifiers.length > 0 && (
                                        <small>{item.modifiers.join(' · ')}</small>
                                    )}
                                    {item.note && <small>Note: {item.note}</small>}
                                    {item.guestName && <small>{item.guestName}</small>}
                                </div>
                                <span className="price-dual compact">
                                    <strong>{moneyUsd(item.lineTotalCents)}</strong>
                                    <small>{moneyXcg(item.lineTotalCents)}</small>
                                </span>
                            </li>
                        ))}
                    </ul>

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

                    <div className="guest-payment-box sticky-payment-box no-print">
                        <p className="eyebrow">Payment option</p>
                        <p className="pin-help">Guest: please tick how you will pay</p>
                        <div className="payment-tick-options" role="group" aria-label="Payment option">
                            {(['cash', 'card', 'mixed'] as PaymentMethod[]).map((method) => (
                                <label key={method} className={preferredPayment === method ? 'ticked' : ''}>
                                    <input
                                        type="radio"
                                        name="guest-payment"
                                        checked={preferredPayment === method}
                                        onChange={() => onPreferredPayment(method)}
                                    />
                                    <span className="tick-box" aria-hidden="true">
                                        {preferredPayment === method ? '☑' : '☐'}
                                    </span>
                                    <span>{method}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="signature-block no-print">
                        <div className="signature-head">
                            <p className="eyebrow">Guest signature</p>
                            <button type="button" className="ghost-text" onClick={clearSignature}>
                                Clear
                            </button>
                        </div>
                        <canvas
                            ref={canvasRef}
                            className="signature-pad"
                            width={560}
                            height={140}
                            onPointerDown={(event) => {
                                event.preventDefault();
                                canvasRef.current?.setPointerCapture(event.pointerId);
                                beginStroke(pointFromEvent(event));
                            }}
                            onPointerMove={(event) => continueStroke(pointFromEvent(event))}
                            onPointerUp={finishStroke}
                            onPointerCancel={finishStroke}
                            onMouseDown={(event) => beginStroke(pointFromEvent(event))}
                            onMouseMove={(event) => continueStroke(pointFromEvent(event))}
                            onMouseUp={finishStroke}
                            onMouseLeave={finishStroke}
                        />
                        <label className="signature-confirm">
                            <input
                                type="checkbox"
                                checked={signed}
                                onChange={(event) => {
                                    if (event.target.checked) {
                                        const canvas = canvasRef.current;
                                        if (canvas) {
                                            const ctx = canvas.getContext('2d');
                                            if (ctx && !hasStroke) {
                                                ctx.strokeStyle = '#1a1a1a';
                                                ctx.lineWidth = 2;
                                                ctx.beginPath();
                                                ctx.moveTo(40, 80);
                                                ctx.quadraticCurveTo(120, 30, 220, 70);
                                                ctx.quadraticCurveTo(300, 100, 400, 55);
                                                ctx.stroke();
                                            }
                                            onSignature(canvas.toDataURL('image/png'));
                                        }
                                        setHasStroke(true);
                                    } else {
                                        clearSignature();
                                    }
                                }}
                            />
                            Guest confirms signature above
                        </label>
                        <p className="pin-help">Sign above (or confirm) to approve this bill for payment.</p>
                    </div>

                    {signatureDataUrl && (
                        <div className="signature-print-only print-only">
                            <p>Guest signature</p>
                            <img src={signatureDataUrl} alt="Guest signature" />
                            {preferredPayment && <p>Payment: {preferredPayment}</p>}
                        </div>
                    )}
                </div>

                <div className="modal-actions no-print guest-bill-actions">
                    <button type="button" className="secondary-button" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="generate-button"
                        disabled={!canCollect}
                        onClick={handleApprove}
                    >
                        <Icon name="check" /> Approve &amp; take payment
                    </button>
                </div>
            </div>
        </div>
    );
}
