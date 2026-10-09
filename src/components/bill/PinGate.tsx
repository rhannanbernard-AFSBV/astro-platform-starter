import { useState } from 'react';
import { Icon } from './Icons';

type Props = {
    pinInput: string;
    pinError: string | null;
    helpText?: string;
    title?: string;
    eyebrow?: string;
    submitLabel?: string;
    /** When true, close is hidden and overlay uses session-lock styling. */
    lockMode?: boolean;
    demoCredentials?: string;
    onPinInput: (value: string) => void;
    onSubmit: () => void;
    onClose: () => void;
};

export default function PinGate({
    pinInput,
    pinError,
    helpText = 'Enter your staff PIN',
    title = 'Enter PIN',
    eyebrow = 'Staff access',
    submitLabel = 'Sign in',
    lockMode = false,
    demoCredentials,
    onPinInput,
    onSubmit,
    onClose,
}: Props) {
    const [showDemo, setShowDemo] = useState(false);

    return (
        <div
            className={`receipt-overlay${lockMode ? ' session-lock' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label={lockMode ? 'Station locked' : 'Staff PIN'}
        >
            <div className="receipt-sheet modifier-sheet">
                <div className="receipt-toolbar">
                    <div>
                        <p className="eyebrow">{eyebrow}</p>
                        <h2>{title}</h2>
                    </div>
                    {!lockMode && (
                        <button type="button" className="ghost" onClick={onClose} aria-label="Close PIN">
                            <Icon name="close" />
                        </button>
                    )}
                    {lockMode && <Icon name="lock" />}
                </div>
                <div className="modifier-body">
                    <p className="pin-help">{helpText}</p>
                    <label className="custom-tip">
                        PIN
                        <input
                            type="password"
                            inputMode="numeric"
                            value={pinInput}
                            onChange={(event) => onPinInput(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') onSubmit();
                            }}
                            autoFocus
                        />
                    </label>
                    {pinError && <p className="share-feedback">{pinError}</p>}
                    <button type="button" className="generate-button" onClick={onSubmit}>
                        {submitLabel}
                    </button>
                    {demoCredentials && !lockMode && (
                        <div className="demo-credentials">
                            <button
                                type="button"
                                className="ghost-text"
                                onClick={() => setShowDemo((value) => !value)}
                            >
                                {showDemo ? 'Hide demo credentials' : 'Show demo credentials'}
                            </button>
                            {showDemo && <p className="pin-help">{demoCredentials}</p>}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
