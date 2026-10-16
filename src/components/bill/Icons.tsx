import type { ReactNode } from 'react';

export type IconName =
    | 'search'
    | 'receipt'
    | 'trash'
    | 'check'
    | 'clock'
    | 'print'
    | 'share'
    | 'download'
    | 'users'
    | 'settings'
    | 'plus'
    | 'close'
    | 'chef'
    | 'chart'
    | 'lock'
    | 'wifi';

export function Icon({ name }: { name: IconName }) {
    const paths: Record<IconName, ReactNode> = {
        search: (
            <>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-4-4" />
            </>
        ),
        receipt: (
            <>
                <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
                <path d="M9 8h6M9 12h6" />
            </>
        ),
        trash: <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />,
        check: <path d="m5 12 4 4L19 6" />,
        clock: (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </>
        ),
        print: (
            <>
                <path d="M6 9V3h12v6M6 17H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="13" width="12" height="8" />
            </>
        ),
        share: (
            <>
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
            </>
        ),
        download: <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />,
        users: (
            <>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </>
        ),
        settings: (
            <>
                <circle cx="12" cy="12" r="3" />
                <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
            </>
        ),
        plus: <path d="M12 5v14M5 12h14" />,
        close: <path d="M18 6 6 18M6 6l12 12" />,
        chef: (
            <>
                <path d="M4 14h16v6H4zM8 14V9a4 4 0 0 1 8 0v5" />
                <path d="M9 9c0-2 1.5-3 3-3s3 1 3 3" />
            </>
        ),
        chart: (
            <>
                <path d="M4 19h16" />
                <path d="M7 16V9M12 16V5M17 16v-6" />
            </>
        ),
        lock: (
            <>
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </>
        ),
        wifi: (
            <>
                <path d="M5 12.5a9 9 0 0 1 14 0" />
                <path d="M8.5 16a5 5 0 0 1 7 0" />
                <circle cx="12" cy="20" r="1" />
            </>
        ),
    };
    return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
            {paths[name]}
        </svg>
    );
}
