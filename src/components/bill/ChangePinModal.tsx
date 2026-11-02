import { useState } from 'react';
import { Icon } from './Icons';

type Props = {
    staffName: string;
    error: string | null;
    busy?: boolean;
    onSubmit: (currentPin: string, newPin: string) => void;
};

export default function ChangePinModal({ staffName, error, busy, onSubmit }: Props) {
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [localError, setLocalError] = useState<string | null>(null);

    const submit = () => {
        if (!/^\d{4,8}$/.test(currentPin) || !/^\d{4,8}$/.test(newPin)) {
            setLocalError('PINs must be 4–8 digits.');
            return;
        }
        if (newPin !== confirmPin) {
            setLocalError('New PIN confirmation does not match.');
            return;
        }
        if (newPin === currentPin) {
            setLocalError('Choose a different PIN from the current one.');
            return;
        }
        setLocalError(null);
        onSubmit(currentPin, newPin);
    };

    return (
        <div className="receipt-overlay session-lock" role="dialog" aria-modal="true" aria-label="Change PIN">
            <div className="receipt-sheet modifier-sheet">
                <div className="receipt-toolbar">
                    <div>
                        <p className="eyebrow">Security required</p>
                        <h2>Change your PIN</h2>
                    </div>
                    <Icon name="lock" />
                </div>
                <div className="modifier-body">
                    <p className="pin-help">
                        {staffName}, this account still uses a demo PIN. Set a private PIN before using
                        the floor — owners rely on this for trusted access.
                    </p>
                    <label className="custom-tip">
                        Current PIN
                        <input
                            type="password"
                            inputMode="numeric"
                            value={currentPin}
                            onChange={(event) => setCurrentPin(event.target.value)}
                            autoFocus
                        />
                    </label>
                    <label className="custom-tip">
                        New PIN
                        <input
                            type="password"
                            inputMode="numeric"
                            value={newPin}
                            onChange={(event) => setNewPin(event.target.value)}
                        />
                    </label>
                    <label className="custom-tip">
                        Confirm new PIN
                        <input
                            type="password"
                            inputMode="numeric"
                            value={confirmPin}
                            onChange={(event) => setConfirmPin(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') submit();
                            }}
                        />
                    </label>
                    {(localError || error) && (
                        <p className="share-feedback">{localError || error}</p>
                    )}
                    <button
                        type="button"
                        className="generate-button"
                        disabled={busy}
                        onClick={submit}
                    >
                        {busy ? 'Saving…' : 'Save PIN & continue'}
                    </button>
                </div>
            </div>
        </div>
    );
}
