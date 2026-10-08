import { useState } from 'react';
import { Icon } from './Icons';

type Props = {
    pinInput: string;
    pinError: string | null;
    helpText?: string;
    demoCredentials?: string;
    onPinInput: (value: string) => void;
    onSubmit: () => void;
    onClose: () => void;
};

export default function PinGate({
    pinInput,
    pinError,
    helpText = 'Enter your staff PIN',
    demoCredentials,
    onPinInput,
    onSubmit,
    onClose,
}: Props) {
    const [showDemo, setShowDemo] = useState(false);

    return (
        <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label="Staff PIN">
            <div className="receipt-sheet modifier-sheet">
                <div className="receipt-toolbar">
                    <div>
                        <p className="eyebrow">Staff access</p>
                        <h2>Enter PIN</h2>
                    </div>
                    <button type="button" className="ghost" onClick={onClose} aria-label="Close PIN">
                        <Icon name="close" />
                    </button>
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
                        Sign in
                    </button>
                    {demoCredentials && (
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
