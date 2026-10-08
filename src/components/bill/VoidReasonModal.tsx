import { useState } from 'react';
import { Icon } from './Icons';

const PRESETS = [
    'Guest changed mind',
    'Wrong item / modifier',
    '86’d / out of stock',
    'Duplicate ticket',
    'Manager comp',
    'Other',
] as const;

type Props = {
    title: string;
    details: string;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
};

export default function VoidReasonModal({ title, details, onConfirm, onCancel }: Props) {
    const [preset, setPreset] = useState<(typeof PRESETS)[number]>('Guest changed mind');
    const [custom, setCustom] = useState('');

    const resolved = preset === 'Other' ? custom.trim() : preset;

    return (
        <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label={title}>
            <div className="receipt-sheet modifier-sheet">
                <div className="receipt-toolbar">
                    <div>
                        <p className="eyebrow">Void audit</p>
                        <h2>{title}</h2>
                        <p className="pin-help">{details}</p>
                    </div>
                    <button type="button" className="ghost" onClick={onCancel} aria-label="Cancel void">
                        <Icon name="close" />
                    </button>
                </div>
                <div className="modifier-body">
                    <div className="tip-presets" role="group" aria-label="Void reason">
                        {PRESETS.map((entry) => (
                            <button
                                key={entry}
                                type="button"
                                className={preset === entry ? 'active' : ''}
                                onClick={() => setPreset(entry)}
                            >
                                {entry}
                            </button>
                        ))}
                    </div>
                    {preset === 'Other' && (
                        <label className="custom-tip">
                            Reason
                            <input
                                type="text"
                                value={custom}
                                onChange={(event) => setCustom(event.target.value)}
                                placeholder="Describe why this is being voided"
                                autoFocus
                            />
                        </label>
                    )}
                    <div className="modal-actions">
                        <button type="button" className="secondary-button" onClick={onCancel}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="generate-button"
                            disabled={!resolved}
                            onClick={() => onConfirm(resolved)}
                        >
                            Confirm void
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
