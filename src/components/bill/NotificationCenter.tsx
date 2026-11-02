import { Icon } from './Icons';
import type { AppNotification } from './types';

type Props = {
    notifications: AppNotification[];
    staffId: string;
    open: boolean;
    onToggle: () => void;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
};

export default function NotificationCenter({
    notifications,
    staffId,
    open,
    onToggle,
    onMarkRead,
    onMarkAllRead,
}: Props) {
    const unread = notifications.filter((n) => !n.readBy.includes(staffId)).length;

    return (
        <div className="notif-center">
            <button
                type="button"
                className="notif-bell"
                onClick={onToggle}
                aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
                aria-expanded={open}
            >
                <Icon name="bell" />
                {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
            </button>
            {open && (
                <div className="notif-panel" role="dialog" aria-label="Notifications">
                    <header>
                        <strong>Notifications</strong>
                        {unread > 0 && (
                            <button type="button" className="ghost-text" onClick={onMarkAllRead}>
                                Mark all read
                            </button>
                        )}
                    </header>
                    {notifications.length === 0 ? (
                        <p className="notif-empty">No notifications yet.</p>
                    ) : (
                        <ul>
                            {notifications.map((n) => {
                                const isUnread = !n.readBy.includes(staffId);
                                return (
                                    <li key={n.id} className={isUnread ? 'unread' : ''}>
                                        <button type="button" onClick={() => onMarkRead(n.id)}>
                                            <strong>{n.title}</strong>
                                            <span>{n.message}</span>
                                            <small>
                                                {n.orderNumber ? `${n.orderNumber} · ` : ''}
                                                {new Date(n.createdAt).toLocaleTimeString()}
                                            </small>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
