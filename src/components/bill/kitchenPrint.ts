/**
 * Kitchen / bar ticket printing.
 * Builds ESC/POS bytes for thermal printers (Web Serial) and a monospace
 * HTML fallback for browser print when no serial device is available.
 */

import type { MenuItem, OrderLine, RestaurantProfile, TableOrder } from './types';

export type PrintTicketKind = 'kitchen' | 'bar' | 'receipt';

export type TicketLine = {
    quantity: number;
    name: string;
    modifiers: string[];
    note: string;
    orderNumber: string | null;
    courseFire?: string | null;
};

export type PrintTicketPayload = {
    kind: PrintTicketKind;
    restaurantName: string;
    tableLabel: string;
    orderNumber: string | null;
    serverName: string;
    printedAt: string;
    lines: TicketLine[];
};

const ESC = 0x1b;
const GS = 0x1d;

function encodeAscii(text: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        out.push(code < 128 ? code : 63); // '?'
    }
    return out;
}

function line(text: string, feed = true): number[] {
    return [...encodeAscii(text), ...(feed ? [0x0a] : [])];
}

/** ESC/POS payload suitable for 58/80mm thermal printers. */
export function buildEscPosBytes(ticket: PrintTicketPayload): Uint8Array {
    const bytes: number[] = [];
    bytes.push(ESC, 0x40); // init
    bytes.push(ESC, 0x61, 0x01); // center
    bytes.push(GS, 0x21, 0x11); // double size
    bytes.push(...line(ticket.kind === 'bar' ? 'BAR TICKET' : 'KITCHEN TICKET'));
    bytes.push(GS, 0x21, 0x00);
    bytes.push(...line(ticket.restaurantName));
    bytes.push(ESC, 0x61, 0x00); // left
    bytes.push(...line('--------------------------------'));
    bytes.push(...line(ticket.tableLabel));
    if (ticket.orderNumber) bytes.push(...line(ticket.orderNumber));
    bytes.push(...line(`Server: ${ticket.serverName}`));
    bytes.push(...line(new Date(ticket.printedAt).toLocaleString()));
    bytes.push(...line('--------------------------------'));
    for (const entry of ticket.lines) {
        bytes.push(GS, 0x21, 0x01);
        bytes.push(...line(`${entry.quantity}x ${entry.name}`));
        bytes.push(GS, 0x21, 0x00);
        if (entry.courseFire && entry.courseFire !== 'fire') {
            bytes.push(...line(`  [${entry.courseFire.toUpperCase()}]`));
        }
        for (const mod of entry.modifiers) {
            bytes.push(...line(`  - ${mod}`));
        }
        if (entry.note) bytes.push(...line(`  NOTE: ${entry.note}`));
    }
    bytes.push(...line('--------------------------------'));
    bytes.push(...line('*** FIRE ***'));
    bytes.push(0x0a, 0x0a, 0x0a);
    bytes.push(GS, 0x56, 0x00); // partial cut
    return new Uint8Array(bytes);
}

export function buildPrintTicketHtml(ticket: PrintTicketPayload): string {
    const rows = ticket.lines
        .map((entry) => {
            const mods = [...entry.modifiers, entry.note].filter(Boolean).join(' · ');
            const course =
                entry.courseFire && entry.courseFire !== 'fire'
                    ? ` <em>[${entry.courseFire}]</em>`
                    : '';
            return `<div class="t-line"><strong>${entry.quantity}× ${escapeHtml(entry.name)}</strong>${course}${
                mods ? `<div class="t-mod">${escapeHtml(mods)}</div>` : ''
            }</div>`;
        })
        .join('');
    return `<!doctype html><html><head><title>${ticket.kind} ticket</title>
<style>
body{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;margin:12px;color:#111}
h1{font-size:18px;margin:0 0 4px}
.meta{margin:0 0 8px;opacity:.8}
.t-line{margin:8px 0;border-bottom:1px dashed #999;padding-bottom:6px}
.t-mod{font-size:12px;margin-top:2px}
.fire{margin-top:12px;font-weight:700;letter-spacing:.08em}
</style></head><body>
<h1>${ticket.kind === 'bar' ? 'BAR TICKET' : 'KITCHEN TICKET'}</h1>
<p class="meta">${escapeHtml(ticket.restaurantName)}<br/>
${escapeHtml(ticket.tableLabel)}${ticket.orderNumber ? ` · ${escapeHtml(ticket.orderNumber)}` : ''}<br/>
Server ${escapeHtml(ticket.serverName)} · ${escapeHtml(new Date(ticket.printedAt).toLocaleString())}</p>
${rows}
<p class="fire">*** FIRE ***</p>
<script>window.onload=function(){window.print();setTimeout(function(){window.close()},400)}</script>
</body></html>`;
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function ticketFromTable(options: {
    kind: PrintTicketKind;
    table: TableOrder;
    lines: OrderLine[];
    menuById: Map<string, MenuItem>;
    restaurant: RestaurantProfile;
    serverName: string;
    orderNumber?: string | null;
}): PrintTicketPayload {
    const { kind, table, lines, menuById, restaurant, serverName, orderNumber } = options;
    return {
        kind,
        restaurantName: restaurant.name,
        tableLabel: table.label,
        orderNumber: orderNumber ?? lines.find((line) => line.orderNumber)?.orderNumber ?? null,
        serverName,
        printedAt: new Date().toISOString(),
        lines: lines.map((line) => ({
            quantity: line.quantity,
            name: menuById.get(line.menuItemId)?.name ?? 'Item',
            modifiers: line.modifiers.map((mod) => mod.name),
            note: line.note,
            orderNumber: line.orderNumber,
            courseFire: line.courseFire,
        })),
    };
}

type SerialPortLike = {
    open: (options: { baudRate: number }) => Promise<void>;
    writable: WritableStream<Uint8Array> | null;
    close: () => Promise<void>;
};

/** Prefer Web Serial ESC/POS when a port is already chosen; else browser print window. */
export async function printTicket(
    ticket: PrintTicketPayload,
    options: { preferSerial?: boolean } = {},
): Promise<'serial' | 'browser'> {
    if (options.preferSerial !== false && typeof navigator !== 'undefined') {
        const nav = navigator as Navigator & {
            serial?: { getPorts: () => Promise<SerialPortLike[]> };
        };
        try {
            const ports = (await nav.serial?.getPorts?.()) ?? [];
            const port = ports[0];
            if (port) {
                await port.open({ baudRate: 9600 });
                const writer = port.writable?.getWriter();
                if (writer) {
                    await writer.write(buildEscPosBytes(ticket));
                    writer.releaseLock();
                }
                await port.close();
                return 'serial';
            }
        } catch {
            /* fall through to browser print */
        }
    }
    if (typeof window === 'undefined') return 'browser';
    const popup = window.open('', '_blank', 'noopener,noreferrer,width=420,height=640');
    if (popup) {
        popup.document.write(buildPrintTicketHtml(ticket));
        popup.document.close();
    } else {
        window.print();
    }
    return 'browser';
}

export async function requestSerialPrinter(): Promise<boolean> {
    const nav = navigator as Navigator & {
        serial?: {
            requestPort: () => Promise<SerialPortLike>;
        };
    };
    if (!nav.serial?.requestPort) return false;
    try {
        await nav.serial.requestPort();
        return true;
    } catch {
        return false;
    }
}
