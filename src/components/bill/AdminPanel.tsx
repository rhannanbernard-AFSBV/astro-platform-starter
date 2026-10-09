import { Icon } from './Icons';
import { optimizeImageUrl } from './images';
import Price from './Price';
import { stationDeepLink, type StationKey } from './posLogic';
import {
    MENU_CATEGORIES,
    type AuditEntry,
    type MenuCategory,
    type MenuItem,
    type PosSettings,
    type TableOrder,
} from './types';

type MenuForm = Omit<MenuItem, 'id'>;

type Props = {
    menu: MenuItem[];
    tables: TableOrder[];
    activeTableId: string;
    menuForm: MenuForm;
    editingId: string | null;
    newTableLabel: string;
    settings: PosSettings;
    auditLog: AuditEntry[];
    onFormChange: (updater: (current: MenuForm) => MenuForm) => void;
    onSaveItem: () => void;
    onCancelEdit: () => void;
    onEditItem: (item: MenuItem) => void;
    onDeleteItem: (id: string) => void;
    onNewTableLabel: (value: string) => void;
    onAddTable: () => void;
    onSwitchTable: (id: string) => void;
    onSettingsChange: (patch: Partial<PosSettings>) => void;
};

const STATION_LINKS: Array<{ key: StationKey; label: string }> = [
    { key: 'service', label: 'Service / floor' },
    { key: 'kitchen', label: 'Kitchen expo' },
    { key: 'reports', label: 'Sales' },
    { key: 'admin', label: 'Menu admin' },
];

export default function AdminPanel({
    menu,
    tables,
    activeTableId,
    menuForm,
    editingId,
    newTableLabel,
    settings,
    auditLog,
    onFormChange,
    onSaveItem,
    onCancelEdit,
    onEditItem,
    onDeleteItem,
    onNewTableLabel,
    onAddTable,
    onSwitchTable,
    onSettingsChange,
}: Props) {
    const copyStation = async (station: StationKey) => {
        const url = stationDeepLink(station);
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            /* ignore */
        }
    };

    return (
        <section className="menu-panel admin-panel">
            <div className="menu-heading">
                <div>
                    <p className="eyebrow">Menu editor</p>
                    <h1>Manage dishes</h1>
                </div>
            </div>
            <div className="admin-settings">
                <h2>House settings</h2>
                <div className="admin-row">
                    <label>
                        XCG per 1 USD
                        <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={settings.xcgPerUsd}
                            onChange={(event) =>
                                onSettingsChange({
                                    xcgPerUsd: Math.max(0.01, Number(event.target.value || 1.8)),
                                })
                            }
                        />
                    </label>
                    <label>
                        Default service charge %
                        <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={settings.defaultServiceChargePercent}
                            onChange={(event) =>
                                onSettingsChange({
                                    defaultServiceChargePercent: Math.max(
                                        0,
                                        Number(event.target.value || 0),
                                    ),
                                })
                            }
                        />
                    </label>
                    <label>
                        Kitchen bump after (minutes)
                        <input
                            type="number"
                            min="1"
                            step="1"
                            value={settings.bumpAfterMinutes}
                            onChange={(event) =>
                                onSettingsChange({
                                    bumpAfterMinutes: Math.max(
                                        1,
                                        Number(event.target.value || 8),
                                    ),
                                })
                            }
                        />
                    </label>
                    <label>
                        Station idle lock (minutes)
                        <input
                            type="number"
                            min="0"
                            step="1"
                            value={settings.idleLockMinutes}
                            onChange={(event) =>
                                onSettingsChange({
                                    idleLockMinutes: Math.max(
                                        0,
                                        Number(event.target.value || 0),
                                    ),
                                })
                            }
                        />
                    </label>
                </div>
                <p className="fx-note">
                    FX, service charge, bump timer, and idle lock sync across open tabs. Set idle lock
                    to 0 to disable the station lock screen.
                </p>
                <h2>Station deep-links</h2>
                <p className="fx-note">
                    Open each station on a tablet or second screen. Links set{' '}
                    <code>?station=</code> so the view opens ready for that role.
                </p>
                <div className="station-link-list">
                    {STATION_LINKS.map((entry) => (
                        <div key={entry.key} className="station-link-row">
                            <a href={stationDeepLink(entry.key)}>{entry.label}</a>
                            <code>?station={entry.key}</code>
                            <button type="button" onClick={() => void copyStation(entry.key)}>
                                Copy
                            </button>
                        </div>
                    ))}
                </div>
                <h2>Void audit log</h2>
                {auditLog.length === 0 ? (
                    <p className="fx-note">No voids recorded yet.</p>
                ) : (
                    <ul className="audit-log-list">
                        {auditLog.slice(0, 12).map((entry) => (
                            <li key={entry.id}>
                                <strong>
                                    {entry.kind.replace('_', ' ')} · {entry.staffName}
                                </strong>
                                <span>
                                    {entry.tableLabel ?? '—'} ·{' '}
                                    {new Date(entry.createdAt).toLocaleString()}
                                </span>
                                <span>
                                    {entry.reason}
                                    {entry.details ? ` — ${entry.details}` : ''}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="admin-grid">
                <form
                    className="admin-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        onSaveItem();
                    }}
                >
                    <h2>{editingId ? 'Edit item' : 'Add item'}</h2>
                    <label>
                        Name
                        <input
                            value={menuForm.name}
                            onChange={(event) =>
                                onFormChange((current) => ({ ...current, name: event.target.value }))
                            }
                            required
                        />
                    </label>
                    <label>
                        Description
                        <textarea
                            value={menuForm.description}
                            onChange={(event) =>
                                onFormChange((current) => ({
                                    ...current,
                                    description: event.target.value,
                                }))
                            }
                            rows={3}
                        />
                    </label>
                    <div className="admin-row">
                        <label>
                            Category
                            <select
                                value={menuForm.category}
                                onChange={(event) =>
                                    onFormChange((current) => ({
                                        ...current,
                                        category: event.target.value as MenuCategory,
                                    }))
                                }
                            >
                                {MENU_CATEGORIES.map((entry) => (
                                    <option key={entry} value={entry}>
                                        {entry}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Price (USD)
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={(menuForm.priceCents / 100).toFixed(2)}
                                onChange={(event) =>
                                    onFormChange((current) => ({
                                        ...current,
                                        priceCents: Math.round(Number(event.target.value || 0) * 100),
                                    }))
                                }
                                required
                            />
                        </label>
                    </div>
                    <p className="fx-note">
                        XCG preview: shown on menu at {settings.xcgPerUsd.toFixed(2)} × USD
                    </p>
                    <label>
                        Image URL
                        <input
                            value={menuForm.image}
                            onChange={(event) =>
                                onFormChange((current) => ({ ...current, image: event.target.value }))
                            }
                        />
                    </label>
                    <label className="checkbox">
                        <input
                            type="checkbox"
                            checked={Boolean(menuForm.popular)}
                            onChange={(event) =>
                                onFormChange((current) => ({
                                    ...current,
                                    popular: event.target.checked,
                                }))
                            }
                        />
                        Mark as popular
                    </label>
                    <div className="admin-actions">
                        <button className="generate-button" type="submit">
                            {editingId ? 'Save changes' : 'Add to menu'}
                        </button>
                        {editingId && (
                            <button type="button" className="secondary-button" onClick={onCancelEdit}>
                                Cancel
                            </button>
                        )}
                    </div>
                </form>
                <div className="admin-list">
                    <div className="table-manager">
                        <h2>Tables</h2>
                        <div className="admin-row">
                            <input
                                value={newTableLabel}
                                onChange={(event) => onNewTableLabel(event.target.value)}
                                placeholder="New table label"
                                aria-label="New table label"
                            />
                            <button type="button" className="secondary-button" onClick={onAddTable}>
                                <Icon name="plus" /> Add table
                            </button>
                        </div>
                        <ul className="table-list">
                            {tables.map((table) => (
                                <li key={table.id}>
                                    <button
                                        type="button"
                                        className={table.id === activeTableId ? 'active' : ''}
                                        onClick={() => onSwitchTable(table.id)}
                                    >
                                        <strong>{table.label}</strong>
                                        <span>{table.status}</span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <h2>Current menu</h2>
                    {menu.map((item) => (
                        <div className="admin-item" key={item.id}>
                            <img src={optimizeImageUrl(item.image, 112)} alt="" loading="lazy" />
                            <div>
                                <strong>{item.name}</strong>
                                <p>
                                    {item.category} · <Price cents={item.priceCents} compact /> ·{' '}
                                    {item.modifierGroups.length} modifier groups
                                </p>
                            </div>
                            <div className="admin-item-actions">
                                <button type="button" onClick={() => onEditItem(item)}>
                                    Edit
                                </button>
                                <button type="button" onClick={() => onDeleteItem(item.id)}>
                                    Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
