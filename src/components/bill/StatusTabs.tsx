import { ACTIVE_KITCHEN_STATUSES, STATUS_META, type ActiveKitchenStatus } from './statusUi';

type Props = {
    active?: ActiveKitchenStatus | 'all';
    counts?: Partial<Record<ActiveKitchenStatus, number>>;
    onSelect?: (status: ActiveKitchenStatus | 'all') => void;
    showAll?: boolean;
};

export default function StatusTabs({
    active = 'all',
    counts,
    onSelect,
    showAll = true,
}: Props) {
    const interactive = typeof onSelect === 'function';

    return (
        <div
            className={`status-tabs ${interactive ? '' : 'status-tabs-legend'}`}
            role={interactive ? 'tablist' : 'group'}
            aria-label="Order status color codes"
        >
            {showAll &&
                (interactive ? (
                    <button
                        type="button"
                        role="tab"
                        aria-selected={active === 'all'}
                        className={`status-tab status-tab-all ${active === 'all' ? 'active' : ''}`}
                        onClick={() => onSelect('all')}
                    >
                        All
                    </button>
                ) : (
                    <span className="status-tab status-tab-all">All</span>
                ))}
            {ACTIVE_KITCHEN_STATUSES.map((status) => {
                const meta = STATUS_META[status];
                const count = counts?.[status];
                const className = `status-tab ${meta.className} ${active === status ? 'active' : ''}`;
                const label = (
                    <>
                        <span className="status-dot-swatch" aria-hidden="true" />
                        <span>
                            {meta.label}
                            {typeof count === 'number' ? ` (${count})` : ''}
                        </span>
                    </>
                );
                if (!interactive) {
                    return (
                        <span
                            key={status}
                            className={className}
                            title={`${meta.label} — color coded`}
                        >
                            {label}
                        </span>
                    );
                }
                return (
                    <button
                        key={status}
                        type="button"
                        role="tab"
                        aria-selected={active === status}
                        className={className}
                        onClick={() => onSelect(status)}
                        title={`${meta.label} — color coded`}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

export function StatusChip({ status }: { status: string }) {
    if (status === 'draft') {
        return <span className="status-chip-line status-chip-draft">Draft</span>;
    }
    const meta = STATUS_META[status as ActiveKitchenStatus];
    if (!meta) return <span className="status-chip-line">{status}</span>;
    return (
        <span className={`status-chip-line ${meta.className}`} title={`${meta.label} — color coded`}>
            {meta.label}
        </span>
    );
}
