import type { KitchenStatus, MenuCategory, MenuItem } from './types';

export const ACTIVE_KITCHEN_STATUSES = ['queued', 'preparing', 'ready', 'served'] as const;
export type ActiveKitchenStatus = (typeof ACTIVE_KITCHEN_STATUSES)[number];

export const STATUS_META: Record<
    ActiveKitchenStatus,
    { label: string; short: string; className: string }
> = {
    queued: { label: 'Queued', short: 'Queued', className: 'status-tab-queued' },
    preparing: { label: 'Preparing', short: 'Preparing', className: 'status-tab-preparing' },
    ready: { label: 'Ready', short: 'Ready', className: 'status-tab-ready' },
    served: { label: 'Served', short: 'Served', className: 'status-tab-served' },
};

export function isBeverageCategory(category: MenuCategory | string): boolean {
    return category === 'Drinks';
}

export function isBeverageItem(item: Pick<MenuItem, 'category'> | undefined | null): boolean {
    return Boolean(item && isBeverageCategory(item.category));
}

export function isKitchenBoundItem(item: Pick<MenuItem, 'category'> | undefined | null): boolean {
    return Boolean(item && !isBeverageItem(item));
}

export function nextServiceStatus(status: KitchenStatus): KitchenStatus | null {
    switch (status) {
        case 'queued':
            return 'preparing';
        case 'preparing':
            return 'ready';
        case 'ready':
            return 'served';
        default:
            return null;
    }
}

export function statusLabel(status: KitchenStatus): string {
    if (status === 'draft') return 'Draft';
    return STATUS_META[status]?.label ?? status;
}
