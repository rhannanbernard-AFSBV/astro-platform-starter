import { tableStatusTone } from './posLogic';
import type { TableOrder } from './types';

type Props = {
    tables: TableOrder[];
    activeTableId: string;
    onSelect: (tableId: string) => void;
};

const TONE_LABEL = {
    open: 'Open',
    prep: 'In prep',
    ready: 'Ready',
    paid: 'Paid',
} as const;

export default function TableMap({ tables, activeTableId, onSelect }: Props) {
    return (
        <div className="table-map" aria-label="Floor table map">
            <p className="eyebrow">Floor</p>
            <div className="table-map-grid">
                {tables.map((table) => {
                    const tone = tableStatusTone(table);
                    return (
                        <button
                            key={table.id}
                            type="button"
                            className={`table-tile tone-${tone} ${table.id === activeTableId ? 'active' : ''}`}
                            onClick={() => onSelect(table.id)}
                            aria-current={table.id === activeTableId ? 'true' : undefined}
                        >
                            <strong>{table.label.replace(/^Table\s+/i, 'T')}</strong>
                            <span>{TONE_LABEL[tone]}</span>
                            <small>{table.lines.reduce((n, line) => n + line.quantity, 0)} items</small>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
