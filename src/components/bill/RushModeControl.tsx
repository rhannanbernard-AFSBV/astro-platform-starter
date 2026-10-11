import { rushBannerCopy } from './rushMode';

type Props = {
    active: boolean;
    since: string | null;
    disabled?: boolean;
    onToggle: () => void;
};

/** Premium header control — peak-service Rush mode. */
export default function RushModeControl({ active, since, disabled, onToggle }: Props) {
    return (
        <button
            type="button"
            className={`rush-mode-toggle${active ? ' is-on' : ''}`}
            onClick={onToggle}
            disabled={disabled}
            aria-pressed={active}
            title={
                active
                    ? 'Turn off Rush mode — return to normal bump timers'
                    : 'Turn on Rush mode — faster kitchen bumps & guest wait estimates'
            }
        >
            <span className="rush-mode-orb" aria-hidden="true" />
            <span className="rush-mode-copy">
                <strong>{active ? 'Rush on' : 'Rush mode'}</strong>
                <small>{active ? rushBannerCopy(since).replace(/^Rush mode[ ·]*/i, '') : 'Peak tempo'}</small>
            </span>
        </button>
    );
}
