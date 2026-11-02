import { describe, expect, it } from 'vitest';
import { createDefaultState } from './defaults';
import { describeConflict, rebaseLocalOntoRemote } from './syncMerge';

describe('syncMerge', () => {
    it('keeps local open-check edits when remote diverged on another table', () => {
        const base = createDefaultState();
        const remote = structuredClone(base);
        const local = structuredClone(base);
        local.updatedAt = remote.updatedAt + 5;
        local.tables = local.tables.map((table, index) =>
            index === 0
                ? {
                      ...table,
                      tipCents: 500,
                      lines: table.lines.map((line) =>
                          line.kitchenStatus === 'draft'
                              ? { ...line, note: 'Allergy — no shellfish' }
                              : line,
                      ),
                  }
                : table,
        );
        // Remote changed a different table label
        remote.tables = remote.tables.map((table, index) =>
            index === 1 ? { ...table, label: 'Table 99' } : table,
        );

        const merged = rebaseLocalOntoRemote({
            local,
            remote,
            preserveActiveStaffId: local.activeStaffId,
        });
        expect(merged.strategy).toBe('rebased');
        expect(merged.preservedTableIds.length).toBeGreaterThan(0);
        const kept = merged.state.tables.find((table) => table.id === local.tables[0].id);
        expect(kept?.tipCents).toBe(500);
        expect(kept?.lines.some((line) => line.note.includes('Allergy'))).toBe(true);
        expect(merged.state.tables.some((table) => table.label === 'Table 99')).toBe(true);
        expect(describeConflict(merged.preservedTableIds)).toMatch(/kept/i);
    });

    it('lets remote paid status win over local open edits', () => {
        const base = createDefaultState();
        const remote = structuredClone(base);
        const local = structuredClone(base);
        const tableId = remote.tables[0].id;
        remote.tables = remote.tables.map((table) =>
            table.id === tableId
                ? {
                      ...table,
                      status: 'paid',
                      paidAt: '2026-11-02T12:00:00.000Z',
                      payment: {
                          method: 'cash',
                          cashCents: 1000,
                          cardCents: 0,
                          changeDueCents: 0,
                          paidAt: '2026-11-02T12:00:00.000Z',
                      },
                  }
                : table,
        );
        local.tables = local.tables.map((table) =>
            table.id === tableId ? { ...table, tipCents: 999 } : table,
        );

        const merged = rebaseLocalOntoRemote({ local, remote });
        const paid = merged.state.tables.find((table) => table.id === tableId);
        expect(paid?.status).toBe('paid');
        expect(paid?.payment?.method).toBe('cash');
    });
});
