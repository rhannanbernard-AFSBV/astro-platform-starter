import { useCallback, useState } from 'react';
import type { AuditEntry } from './types';

export type VoidPending = {
    kind: AuditEntry['kind'];
    title: string;
    details: string;
    tableLabel: string | null;
    apply: (reason: string) => void;
    mode: 'void' | 'comp';
};

type RequireManager = (action: () => void) => void;

/** Encapsulates void/comp reason modal orchestration for the POS shell. */
export function useVoidFlow(requireManager: RequireManager) {
    const [voidPending, setVoidPending] = useState<VoidPending | null>(null);

    const requestVoid = useCallback(
        (
            kind: AuditEntry['kind'],
            title: string,
            details: string,
            tableLabel: string | null,
            apply: (reason: string) => void,
            needsManager: boolean,
            mode: 'void' | 'comp' = 'void',
        ) => {
            const openVoid = () =>
                setVoidPending({ kind, title, details, tableLabel, apply, mode });
            if (needsManager) {
                requireManager(openVoid);
                return;
            }
            openVoid();
        },
        [requireManager],
    );

    const clearVoid = useCallback(() => setVoidPending(null), []);

    return {
        voidPending,
        requestVoid,
        clearVoid,
        setVoidPending,
    };
}
