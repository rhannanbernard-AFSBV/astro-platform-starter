import { useState } from 'react';
import { tableStatusTone } from './posLogic';
import type { TableOrder } from './types';

type Props = {
    tables: TableOrder[];
    activeTableId: string;
    canOpenBarTab?: boolean;
    canCloseBarTab?: boolean;
    onSelect: (tableId: string) => void;
    onOpenBarTab?: (guestName: string) => void;
    onCloseBarTab?: (tableId: string) => void;
    onRenameBarTab?: (tableId: string, guestName: string) => void;
};

const TONE_LABEL = {
    open: 'Open',
    prep: 'In prep',
    ready: 'Ready',
    partial: 'Partial',
    paid: 'Paid',
} as const;

export default function TableMap({
    tables,
    activeTableId,
    canOpenBarTab = false,
    canCloseBarTab = false,
    onSelect,
    onOpenBarTab,
    onCloseBarTab,
    onRenameBarTab,
}: Props) {
    const [tabName, setTabName] = useState('');
    const [renameValue, setRenameValue] = useState('');
    const floor = tables.filter((table) => table.checkKind !== 'bar_tab');
    const tabs = tables.filter((table) => table.checkKind === 'bar_tab');
    const activeTab = tabs.find((table) => table.id === activeTableId) ?? null;

    const submitTab = () => {
        const name = tabName.trim();
        if (!name || !onOpenBarTab) return;
        onOpenBarTab(name);
        setTabName('');
    };

    const canCloseActiveTab =
        Boolean(activeTab) &&
        canCloseBarTab &&
        Boolean(onCloseBarTab) &&
        (activeTab!.status === 'paid' || activeTab!.lines.length === 0);

    const renderTile = (table: TableOrder) => {
        const tone = tableStatusTone(table);
        const isTab = table.checkKind === 'bar_tab';
        return (
            <button
                key={table.id}
                type="button"
                className={`table-tile tone-${tone} ${table.id === activeTableId ? 'active' : ''}${isTab ? ' bar-tab-tile' : ''}`}
                onClick={() => {
                    onSelect(table.id);
                    if (isTab) {
                        setRenameValue(table.label.replace(/^Tab\s*·\s*/i, ''));
                    }
                }}
                aria-current={table.id === activeTableId ? 'true' : undefined}
            >
                <strong>
                    {isTab
                        ? table.label.replace(/^Tab\s*·\s*/i, '')
                        : table.label.replace(/^Table\s+/i, 'T')}
                </strong>
                <span>{isTab ? `Tab · ${TONE_LABEL[tone]}` : TONE_LABEL[tone]}</span>
                <small>{table.lines.reduce((n, line) => n + line.quantity, 0)} items</small>
            </button>
        );
    };

    return (
        <div className="table-map" aria-label="Floor table map">
            <p className="eyebrow">Floor</p>
            <div className="table-map-grid">{floor.map(renderTile)}</div>

            <div className="bar-tabs-block">
                <p className="eyebrow">Bar tabs</p>
                {canOpenBarTab && onOpenBarTab && (
                    <form
                        className="open-tab-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            submitTab();
                        }}
                    >
                        <input
                            type="text"
                            value={tabName}
                            onChange={(event) => setTabName(event.target.value)}
                            placeholder="Guest name / seat"
                            aria-label="Bar tab guest name"
                        />
                        <button type="submit" className="secondary-button" disabled={!tabName.trim()}>
                            Open tab
                        </button>
                    </form>
                )}
                {tabs.length > 0 ? (
                    <div className="table-map-grid">{tabs.map(renderTile)}</div>
                ) : (
                    <p className="pin-help">No open bar tabs.</p>
                )}
                {activeTab && (onRenameBarTab || canCloseActiveTab) && (
                    <div className="bar-tab-actions">
                        {onRenameBarTab && activeTab.status !== 'paid' && (
                            <form
                                className="open-tab-form"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    const name = renameValue.trim();
                                    if (!name) return;
                                    onRenameBarTab(activeTab.id, name);
                                }}
                            >
                                <input
                                    type="text"
                                    value={renameValue || activeTab.label.replace(/^Tab\s*·\s*/i, '')}
                                    onChange={(event) => setRenameValue(event.target.value)}
                                    placeholder="Rename tab guest"
                                    aria-label="Rename bar tab guest"
                                />
                                <button
                                    type="submit"
                                    className="secondary-button"
                                    disabled={!renameValue.trim()}
                                >
                                    Rename
                                </button>
                            </form>
                        )}
                        {canCloseActiveTab && onCloseBarTab && (
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={() => onCloseBarTab(activeTab.id)}
                            >
                                {activeTab.status === 'paid' ? 'Close paid tab' : 'Close empty tab'}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
