import { formatDual, moneyUsd, moneyXcg } from './math';

type Props = {
    cents: number;
    compact?: boolean;
    className?: string;
};

export default function Price({ cents, compact = false, className }: Props) {
    if (compact) {
        return <span className={className}>{formatDual(cents)}</span>;
    }
    return (
        <span className={`price-dual ${className ?? ''}`.trim()}>
            <strong>{moneyUsd(cents)}</strong>
            <small>{moneyXcg(cents)}</small>
        </span>
    );
}
