import { useRef, useState } from 'react';
import { createId, ensureCoreModifierGroups } from './defaults';
import { fileToMenuImageDataUrl, optimizeImageUrl } from './images';
import { Icon } from './Icons';
import Price from './Price';
import { stationDeepLink, type StationKey } from './posLogic';
import {
    MENU_CATEGORIES,
    MENU_CATEGORY_LABELS,
    type AuditEntry,
    type MenuCategory,
    type MenuItem,
    type ModifierGroup,
    type ModifierOption,
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
    onSaveItem: () => void | Promise<void>;
    onCancelEdit: () => void;
    onEditItem: (item: MenuItem) => void;
    onDeleteItem: (id: string) => void;
    onNewTableLabel: (value: string) => void;
    onAddTable: () => void;
    onSwitchTable: (id: string) => void;
    onSettingsChange: (patch: Partial<PosSettings>) => void;
    onAiEnrich?: () => void | Promise<void>;
    aiEnrichBusy?: boolean;
    aiEnrichNote?: string | null;
};

const STATION_LINKS: Array<{ key: StationKey; label: string }> = [
    { key: 'service', label: 'Service / floor' },
    { key: 'kitchen', label: 'Kitchen expo' },
    { key: 'bar', label: 'Bar rail' },
    { key: 'reports', label: 'Sales' },
    { key: 'admin', label: 'Menu admin' },
];

const STOCK_IMAGES = [
    '/menu/1.svg',
    '/menu/2.svg',
    '/menu/3.svg',
    '/menu/4.svg',
    '/menu/5.svg',
    '/menu/6.svg',
    '/menu/7.svg',
    '/menu/8.svg',
    '/menu/9.svg',
    '/menu/10.svg',
    '/market/mango.svg',
    '/market/plantain.svg',
    '/market/breadfruit.svg',
    '/market/callaloo.svg',
];

function updateGroup(
    groups: ModifierGroup[],
    groupId: 'prep' | 'sides',
    updater: (group: ModifierGroup) => ModifierGroup,
): ModifierGroup[] {
    const ensured = ensureCoreModifierGroups(groups);
    return ensured.map((group) => (group.id === groupId ? updater(group) : group));
}

function ModifierGroupEditor({
    title,
    help,
    group,
    onChange,
}: {
    title: string;
    help: string;
    group: ModifierGroup;
    onChange: (group: ModifierGroup) => void;
}) {
    const setOption = (optionId: string, patch: Partial<ModifierOption>) => {
        onChange({
            ...group,
            options: group.options.map((option) =>
                option.id === optionId ? { ...option, ...patch } : option,
            ),
        });
    };

    const removeOption = (optionId: string) => {
        onChange({
            ...group,
            options: group.options.filter((option) => option.id !== optionId),
        });
    };

    const addOption = () => {
        const option: ModifierOption = {
            id: createId(group.id),
            name: '',
            priceDeltaCents: 0,
        };
        onChange({ ...group, options: [...group.options, option] });
    };

    return (
        <div className="modifier-editor">
            <div className="modifier-editor-head">
                <h3>{title}</h3>
                <span>{group.multi ? 'Multi-select' : 'Pick one'}</span>
            </div>
            <p className="fx-note">{help}</p>
            <ul className="modifier-option-list">
                {group.options.map((option) => (
                    <li key={option.id}>
                        <input
                            type="text"
                            value={option.name}
                            placeholder="Option name"
                            aria-label={`${title} option name`}
                            onChange={(event) => setOption(option.id, { name: event.target.value })}
                        />
                        <label className="modifier-price">
                            +$
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={(option.priceDeltaCents / 100).toFixed(2)}
                                onChange={(event) =>
                                    setOption(option.id, {
                                        priceDeltaCents: Math.round(
                                            Number(event.target.value || 0) * 100,
                                        ),
                                    })
                                }
                            />
                        </label>
                        <button
                            type="button"
                            className="ghost-text danger-text"
                            onClick={() => removeOption(option.id)}
                            disabled={group.options.length <= 1}
                        >
                            Remove
                        </button>
                    </li>
                ))}
            </ul>
            <button type="button" className="secondary-button" onClick={addOption}>
                <Icon name="plus" /> Add option
            </button>
        </div>
    );
}

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
    onAiEnrich,
    aiEnrichBusy = false,
    aiEnrichNote = null,
}: Props) {
    const fileRef = useRef<HTMLInputElement | null>(null);
    const [imageError, setImageError] = useState<string | null>(null);
    const [imageBusy, setImageBusy] = useState(false);

    const groups = ensureCoreModifierGroups(menuForm.modifierGroups);
    const prep = groups.find((group) => group.id === 'prep')!;
    const sides = groups.find((group) => group.id === 'sides')!;

    const copyStation = async (station: StationKey) => {
        const url = stationDeepLink(station);
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            /* ignore */
        }
    };

    const onPickFile = async (file: File | null) => {
        if (!file) return;
        setImageBusy(true);
        setImageError(null);
        try {
            const dataUrl = await fileToMenuImageDataUrl(file);
            onFormChange((current) => ({ ...current, image: dataUrl }));
        } catch (err) {
            setImageError(err instanceof Error ? err.message : 'Could not read image.');
        } finally {
            setImageBusy(false);
            if (fileRef.current) fileRef.current.value = '';
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
                    <label className="checkbox">
                        <input
                            type="checkbox"
                            checked={settings.autoFireDrinks}
                            onChange={(event) =>
                                onSettingsChange({ autoFireDrinks: event.target.checked })
                            }
                        />
                        Auto-fire drinks to bar on add
                    </label>
                </div>
                <p className="fx-note">
                    FX, service charge, bump timer, idle lock, and auto-fire sync across open tabs.
                    Set idle lock to 0 to disable the station lock screen.
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
                <h2>Void / comp audit log</h2>
                {auditLog.length === 0 ? (
                    <p className="fx-note">No voids or comps recorded yet.</p>
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
                    <div className="ai-enrich-block">
                        <div className="admin-row">
                            <button
                                type="button"
                                className="secondary-button"
                                disabled={aiEnrichBusy || !menuForm.name.trim()}
                                onClick={() => void onAiEnrich?.()}
                            >
                                {aiEnrichBusy ? 'GPT-4o writing…' : 'Generate with GPT-4o'}
                            </button>
                        </div>
                        <p className="fx-note">
                            Writes prep method, ingredients, and wine↔meal pairings. Never sets
                            prices. Uses OpenAI GPT-4o when the API key is configured; otherwise a
                            professional local fallback.
                        </p>
                        {aiEnrichNote && <p className="pin-help">{aiEnrichNote}</p>}
                        <label>
                            Ingredients
                            <textarea
                                value={menuForm.ingredients ?? ''}
                                onChange={(event) =>
                                    onFormChange((current) => ({
                                        ...current,
                                        ingredients: event.target.value,
                                    }))
                                }
                                rows={3}
                                placeholder="Ingredient breakdown"
                            />
                        </label>
                        <label>
                            Prep guide
                            <textarea
                                value={menuForm.prepGuide ?? ''}
                                onChange={(event) =>
                                    onFormChange((current) => ({
                                        ...current,
                                        prepGuide: event.target.value,
                                    }))
                                }
                                rows={3}
                                placeholder="How to professionally prepare / serve"
                            />
                        </label>
                        <label>
                            Pairing notes
                            <textarea
                                value={menuForm.pairingNotes ?? ''}
                                onChange={(event) =>
                                    onFormChange((current) => ({
                                        ...current,
                                        pairingNotes: event.target.value,
                                    }))
                                }
                                rows={3}
                                placeholder="Wine↔meal or drink pairings"
                            />
                        </label>
                    </div>
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
                                        {MENU_CATEGORY_LABELS[entry]}
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
                    <div className="admin-row">
                        <label>
                            Origin / made in
                            <input
                                value={menuForm.origin ?? ''}
                                onChange={(event) =>
                                    onFormChange((current) => ({
                                        ...current,
                                        origin: event.target.value,
                                    }))
                                }
                                placeholder="e.g. Marlborough, New Zealand"
                            />
                        </label>
                        <label>
                            Vintage year
                            <input
                                type="number"
                                min="1900"
                                max="2100"
                                value={menuForm.vintageYear ?? ''}
                                onChange={(event) =>
                                    onFormChange((current) => ({
                                        ...current,
                                        vintageYear: event.target.value
                                            ? Number(event.target.value)
                                            : null,
                                    }))
                                }
                                placeholder="e.g. 2022"
                            />
                        </label>
                    </div>
                    <p className="fx-note">
                        XCG preview: shown on menu at {settings.xcgPerUsd.toFixed(2)} × USD
                    </p>

                    <div className="meal-photo-editor">
                        <h3>Meal picture</h3>
                        <div className="meal-photo-preview">
                            <img
                                src={optimizeImageUrl(menuForm.image, 320)}
                                alt=""
                                loading="lazy"
                            />
                            <div className="meal-photo-actions">
                                <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={imageBusy}
                                    onClick={() => fileRef.current?.click()}
                                >
                                    {imageBusy ? 'Uploading…' : 'Upload photo'}
                                </button>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,image/svg+xml"
                                    hidden
                                    onChange={(event) =>
                                        void onPickFile(event.target.files?.[0] ?? null)
                                    }
                                />
                                <label>
                                    Image URL
                                    <input
                                        value={menuForm.image.startsWith('data:') ? '' : menuForm.image}
                                        placeholder={
                                            menuForm.image.startsWith('data:')
                                                ? 'Custom photo uploaded'
                                                : '/menu/1.svg'
                                        }
                                        onChange={(event) =>
                                            onFormChange((current) => ({
                                                ...current,
                                                image: event.target.value,
                                            }))
                                        }
                                    />
                                </label>
                            </div>
                        </div>
                        {imageError && <p className="share-feedback">{imageError}</p>}
                        <p className="fx-note">Stock art — tap to use</p>
                        <div className="stock-image-grid">
                            {STOCK_IMAGES.map((src) => (
                                <button
                                    key={src}
                                    type="button"
                                    className={
                                        menuForm.image === src
                                            ? 'stock-image-btn active'
                                            : 'stock-image-btn'
                                    }
                                    onClick={() =>
                                        onFormChange((current) => ({ ...current, image: src }))
                                    }
                                    aria-label={`Use ${src}`}
                                >
                                    <img src={src} alt="" loading="lazy" />
                                </button>
                            ))}
                        </div>
                    </div>

                    <ModifierGroupEditor
                        title="Prep"
                        help="Extras and prep notes guests can multi-select."
                        group={prep}
                        onChange={(group) =>
                            onFormChange((current) => ({
                                ...current,
                                modifierGroups: updateGroup(
                                    current.modifierGroups,
                                    'prep',
                                    () => group,
                                ),
                            }))
                        }
                    />
                    <ModifierGroupEditor
                        title="Side swap"
                        help="One side choice per plate (rice & peas, festival, plantain…)."
                        group={sides}
                        onChange={(group) =>
                            onFormChange((current) => ({
                                ...current,
                                modifierGroups: updateGroup(
                                    current.modifierGroups,
                                    'sides',
                                    () => group,
                                ),
                            }))
                        }
                    />

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
                    <label className="checkbox">
                        <input
                            type="checkbox"
                            checked={Boolean(menuForm.eightySixed)}
                            onChange={(event) =>
                                onFormChange((current) => ({
                                    ...current,
                                    eightySixed: event.target.checked,
                                }))
                            }
                        />
                        86’d / out of stock
                    </label>
                    <div className="happy-hour-editor">
                        <label className="checkbox">
                            <input
                                type="checkbox"
                                checked={Boolean(menuForm.happyHour)}
                                onChange={(event) =>
                                    onFormChange((current) => ({
                                        ...current,
                                        happyHour: event.target.checked
                                            ? {
                                                  priceCents: Math.max(
                                                      0,
                                                      Math.round(current.priceCents * 0.8),
                                                  ),
                                                  startHour: 16,
                                                  endHour: 19,
                                              }
                                            : null,
                                    }))
                                }
                            />
                            Happy hour / pour price
                        </label>
                        {menuForm.happyHour && (
                            <div className="admin-row">
                                <label>
                                    HH price (USD)
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={(menuForm.happyHour.priceCents / 100).toFixed(2)}
                                        onChange={(event) =>
                                            onFormChange((current) => ({
                                                ...current,
                                                happyHour: current.happyHour
                                                    ? {
                                                          ...current.happyHour,
                                                          priceCents: Math.round(
                                                              Number(event.target.value || 0) * 100,
                                                          ),
                                                      }
                                                    : null,
                                            }))
                                        }
                                    />
                                </label>
                                <label>
                                    Start hour (0–23)
                                    <input
                                        type="number"
                                        min="0"
                                        max="23"
                                        value={menuForm.happyHour.startHour}
                                        onChange={(event) =>
                                            onFormChange((current) => ({
                                                ...current,
                                                happyHour: current.happyHour
                                                    ? {
                                                          ...current.happyHour,
                                                          startHour: Math.min(
                                                              23,
                                                              Math.max(
                                                                  0,
                                                                  Number(event.target.value || 0),
                                                              ),
                                                          ),
                                                      }
                                                    : null,
                                            }))
                                        }
                                    />
                                </label>
                                <label>
                                    End hour (0–23)
                                    <input
                                        type="number"
                                        min="0"
                                        max="23"
                                        value={menuForm.happyHour.endHour}
                                        onChange={(event) =>
                                            onFormChange((current) => ({
                                                ...current,
                                                happyHour: current.happyHour
                                                    ? {
                                                          ...current.happyHour,
                                                          endHour: Math.min(
                                                              23,
                                                              Math.max(
                                                                  0,
                                                                  Number(event.target.value || 0),
                                                              ),
                                                          ),
                                                      }
                                                    : null,
                                            }))
                                        }
                                    />
                                </label>
                            </div>
                        )}
                    </div>
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
                                    {item.category} · <Price cents={item.priceCents} compact />
                                    {item.happyHour
                                        ? ` · HH $${(item.happyHour.priceCents / 100).toFixed(2)} ${item.happyHour.startHour}–${item.happyHour.endHour}h`
                                        : ''}
                                    {item.eightySixed ? ' · 86’d' : ''} ·{' '}
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
