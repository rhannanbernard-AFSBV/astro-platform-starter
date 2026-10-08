import { Icon } from './Icons';
import Price from './Price';
import type { MenuItem } from './types';

type Props = {
    item: MenuItem;
    selectedMods: Record<string, string[]>;
    lineNote: string;
    onToggleMod: (groupId: string, optionId: string, multi: boolean) => void;
    onNote: (value: string) => void;
    onConfirm: () => void;
    onClose: () => void;
};

export default function ModifierModal({
    item,
    selectedMods,
    lineNote,
    onToggleMod,
    onNote,
    onConfirm,
    onClose,
}: Props) {
    return (
        <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Customize item">
            <div className="receipt-sheet modifier-sheet">
                <div className="receipt-toolbar">
                    <div>
                        <p className="eyebrow">Customize</p>
                        <h2>{item.name}</h2>
                        <Price cents={item.priceCents} compact />
                    </div>
                    <button type="button" className="ghost" onClick={onClose} aria-label="Close customize">
                        <Icon name="close" />
                    </button>
                </div>
                <div className="modifier-body">
                    {item.modifierGroups.map((group) => (
                        <div key={group.id} className="mod-group">
                            <h3>
                                {group.name}
                                <small>{group.multi ? 'Multi' : 'Pick one'}</small>
                            </h3>
                            <div className="mod-options">
                                {group.options.map((option) => {
                                    const active = (selectedMods[group.id] ?? []).includes(option.id);
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            className={active ? 'active' : ''}
                                            onClick={() => onToggleMod(group.id, option.id, group.multi)}
                                        >
                                            <span>{option.name}</span>
                                            <strong>
                                                {option.priceDeltaCents === 0 ? (
                                                    'Included'
                                                ) : (
                                                    <>
                                                        +
                                                        <Price cents={option.priceDeltaCents} compact />
                                                    </>
                                                )}
                                            </strong>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    <label className="custom-tip">
                        Special note
                        <input
                            value={lineNote}
                            onChange={(event) => onNote(event.target.value)}
                            placeholder="No onions, allergy note…"
                        />
                    </label>
                    <button type="button" className="generate-button" onClick={onConfirm}>
                        Add to order
                    </button>
                </div>
            </div>
        </div>
    );
}
