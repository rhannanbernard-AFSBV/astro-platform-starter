import { useState } from 'react';
import { Icon } from './Icons';
import { COMP_REASON_PRESETS, VOID_REASON_PRESETS } from './types';

type Mode = 'void' | 'comp';

type Props = {
    title: string;
    details: string;
    mode?: Mode;
    onConfirm: (reason: string) => void;
    onCancel: () => void;
};

export default function VoidReasonModal({
    title,
    details,
    mode = 'void',
    onConfirm,
    onCancel,
}: Props) {
    const presets = mode === 'comp' ? COMP_REASON_PRESETS : VOID_REASON_PRESETS;
    const [preset, setPreset] = useState<string>(presets[0]);
    const [custom, setCustom] = useState('');

    const resolved = preset === 'Other' ? custom.trim() : preset;
    const isComp = mode === 'comp';

    return (
        <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label={title}>
            <div className="receipt-sheet modifier-sheet">
                <div className="receipt-toolbar">
                    <div>
                        <p className="eyebrow">{isComp ? 'Comp audit' : 'Void audit'}</p>
                        <h2>{title}</h2>
                        <p className="pin-help">{details}</p>
                    </div>
                    <button
                        type="button"
                        className="ghost"
                        onClick={onCancel}
                        aria-label={isComp ? 'Cancel comp' : 'Cancel void'}
                    >
                        <Icon name="close" />
                    </button>
                </div>
                <div className="modifier-body">
                    <div className="tip-presets" role="group" aria-label={isComp ? 'Comp reason' : 'Void reason'}>
                        {presets.map((entry) => (
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
                                placeholder={
                                    isComp
                                        ? 'Describe why this is being comped'
                                        : 'Describe why this is being voided'
                                }
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
                            {isComp ? 'Confirm comp' : 'Confirm void'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
