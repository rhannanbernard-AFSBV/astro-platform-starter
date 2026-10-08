import { useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react';

type Props<T> = {
    items: T[];
    itemHeight: number;
    height: number;
    overscan?: number;
    className?: string;
    getKey: (item: T, index: number) => string;
    renderItem: (item: T, index: number) => ReactNode;
};

export default function VirtualList<T>({
    items,
    itemHeight,
    height,
    overscan = 3,
    className,
    getKey,
    renderItem,
}: Props<T>) {
    const ref = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);

    const { start, end, offsetY, totalHeight } = useMemo(() => {
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
        const visibleCount = Math.ceil(height / itemHeight) + overscan * 2;
        const endIndex = Math.min(items.length, startIndex + visibleCount);
        return {
            start: startIndex,
            end: endIndex,
            offsetY: startIndex * itemHeight,
            totalHeight: items.length * itemHeight,
        };
    }, [scrollTop, itemHeight, height, overscan, items.length]);

    const onScroll = (event: UIEvent<HTMLDivElement>) => {
        setScrollTop(event.currentTarget.scrollTop);
    };

    if (items.length <= 12) {
        return (
            <div className={className} style={{ maxHeight: height, overflow: 'auto' }}>
                {items.map((item, index) => (
                    <div key={getKey(item, index)}>{renderItem(item, index)}</div>
                ))}
            </div>
        );
    }

    return (
        <div
            ref={ref}
            className={className}
            style={{ height, overflow: 'auto', position: 'relative' }}
            onScroll={onScroll}
        >
            <div style={{ height: totalHeight, position: 'relative' }}>
                <div style={{ transform: `translateY(${offsetY}px)` }}>
                    {items.slice(start, end).map((item, offset) => {
                        const index = start + offset;
                        return <div key={getKey(item, index)}>{renderItem(item, index)}</div>;
                    })}
                </div>
            </div>
        </div>
    );
}
