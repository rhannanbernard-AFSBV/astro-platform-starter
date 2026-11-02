import type { PersistedState, TableOrder } from './types';

/**
 * When another station wins a revision race, rebase the local active table
 * (and any tables the local staff uniquely edited) onto the remote snapshot
 * instead of blindly discarding floor work.
 */
export function rebaseLocalOntoRemote(options: {
    local: PersistedState;
    remote: PersistedState;
    preserveActiveStaffId?: string | null;
}): {
    state: PersistedState;
    preservedTableIds: string[];
    strategy: 'remote' | 'rebased';
} {
    const { local, remote, preserveActiveStaffId } = options;
    const remoteById = new Map(remote.tables.map((table) => [table.id, table]));
    const localById = new Map(local.tables.map((table) => [table.id, table]));
    const preservedTableIds: string[] = [];

    const mergedTables: TableOrder[] = remote.tables.map((remoteTable) => {
        const localTable = localById.get(remoteTable.id);
        if (!localTable) return remoteTable;
        if (!tableNeedsPreserve(localTable, remoteTable)) return remoteTable;
        // Remote already paid / closed wins for safety.
        if (remoteTable.status === 'paid' && localTable.status !== 'paid') {
            return remoteTable;
        }
        preservedTableIds.push(localTable.id);
        return {
            ...localTable,
            // Keep remote payment seal if remote already captured tender.
            paidAt: remoteTable.paidAt ?? localTable.paidAt,
            payment: remoteTable.payment ?? localTable.payment,
            status:
                remoteTable.status === 'paid' || remoteTable.status === 'partial'
                    ? remoteTable.status
                    : localTable.status,
        };
    });

    // Local-only brand-new tables (opened on this tablet, not yet on remote)
    for (const localTable of local.tables) {
        if (remoteById.has(localTable.id)) continue;
        if (localTable.lines.length === 0 && localTable.status === 'open') {
            mergedTables.push(localTable);
            preservedTableIds.push(localTable.id);
        }
    }

    const strategy = preservedTableIds.length > 0 ? 'rebased' : 'remote';
    const activeStaffId =
        preserveActiveStaffId ??
        local.activeStaffId ??
        remote.activeStaffId;

    return {
        strategy,
        preservedTableIds,
        state: {
            ...remote,
            tables: mergedTables,
            activeTableId: preferActiveTable(
                local.activeTableId,
                remote.activeTableId,
                mergedTables,
            ),
            activeStaffId,
            // Local menu edits are not rebased — remote catalog wins.
            updatedAt: Math.max(local.updatedAt, remote.updatedAt) + 1,
        },
    };
}

function tableNeedsPreserve(local: TableOrder, remote: TableOrder): boolean {
    if (local.lines.length !== remote.lines.length) return true;
    for (let i = 0; i < local.lines.length; i += 1) {
        const a = local.lines[i];
        const b = remote.lines[i];
        if (!b || a.id !== b.id) return true;
        if (a.quantity !== b.quantity) return true;
        if (a.kitchenStatus !== b.kitchenStatus) return true;
        if (a.note !== b.note) return true;
        if (a.compReason !== b.compReason) return true;
        if ((a.modifiers?.length ?? 0) !== (b.modifiers?.length ?? 0)) return true;
    }
    if (local.tipCents !== remote.tipCents) return true;
    if (local.serviceChargeEnabled !== remote.serviceChargeEnabled) return true;
    return false;
}

function preferActiveTable(
    localId: string,
    remoteId: string,
    tables: TableOrder[],
): string {
    if (tables.some((table) => table.id === localId)) return localId;
    if (tables.some((table) => table.id === remoteId)) return remoteId;
    return tables[0]?.id ?? remoteId;
}

export function describeConflict(preservedTableIds: string[]): string {
    if (preservedTableIds.length === 0) {
        return 'Another station updated the floor — reloaded latest tickets.';
    }
    return `Synced with another station · kept ${preservedTableIds.length} local check(s) that were still open here.`;
}
