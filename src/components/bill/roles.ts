import type { AppView, StaffRole, StaffUser } from './types';

export const ROLE_LABELS: Record<StaffRole, string> = {
    kitchen: 'Kitchen',
    server: 'Waiter / Server',
    admin: 'Admin',
    manager: 'Manager',
};

export const DEFAULT_VIEW_BY_ROLE: Record<StaffRole, AppView> = {
    kitchen: 'kitchen',
    server: 'service',
    admin: 'admin',
    manager: 'service',
};

export function viewsForRole(role: StaffRole): AppView[] {
    switch (role) {
        case 'kitchen':
            return ['kitchen'];
        case 'server':
            return ['service'];
        case 'admin':
            return ['service', 'kitchen', 'reports', 'admin', 'users'];
        case 'manager':
            return ['service', 'kitchen', 'reports', 'admin', 'users'];
        default:
            return ['service'];
    }
}

export function canAccessView(role: StaffRole, view: AppView): boolean {
    return viewsForRole(role).includes(view);
}

export function canManageUsers(role: StaffRole): boolean {
    return role === 'admin' || role === 'manager';
}

export function canManageMenu(role: StaffRole): boolean {
    return role === 'admin' || role === 'manager';
}

export function canViewSales(role: StaffRole): boolean {
    return role === 'admin' || role === 'manager';
}

/** Waiter/server service capabilities */
export function canCreateOrders(role: StaffRole): boolean {
    return role === 'server' || role === 'admin' || role === 'manager';
}

export function canSendToKitchen(role: StaffRole): boolean {
    return role === 'server' || role === 'admin' || role === 'manager';
}

export function canGenerateBill(role: StaffRole): boolean {
    return role === 'server' || role === 'admin' || role === 'manager';
}

export function canTakePayment(role: StaffRole): boolean {
    return role === 'server' || role === 'admin' || role === 'manager';
}

export function canRunKitchenBoard(role: StaffRole): boolean {
    return role === 'kitchen' || role === 'admin' || role === 'manager';
}

/** Destructive / privileged ops — Manager only */
export function canClearOrder(role: StaffRole): boolean {
    return role === 'manager';
}

export function canReopenTable(role: StaffRole): boolean {
    return role === 'manager';
}

export function canVoidKitchenItems(role: StaffRole): boolean {
    return role === 'manager';
}

/** Delete kitchen tickets — Manager only (kitchen staff never) */
export function canDeleteTickets(role: StaffRole): boolean {
    return role === 'manager';
}

/** Server-managed beverage status after guest ticket is generated */
export function canUpdateBeverageStatus(role: StaffRole): boolean {
    return role === 'server' || role === 'admin' || role === 'manager';
}

/** Delete / void payments and sales — Manager only */
export function canDeletePayments(role: StaffRole): boolean {
    return role === 'manager';
}

export function canDeleteMenuItems(role: StaffRole): boolean {
    return role === 'admin' || role === 'manager';
}

export function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'NA';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export function roleHelpText(staff: StaffUser[]): string {
    const samples = staff
        .slice()
        .sort((a, b) => a.role.localeCompare(b.role))
        .map((user) => `${ROLE_LABELS[user.role]} ${user.pin}`)
        .slice(0, 4);
    return samples.join(' · ');
}
