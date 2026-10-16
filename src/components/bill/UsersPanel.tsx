import { useState } from 'react';
import { Icon } from './Icons';
import { ROLE_LABELS } from './roles';
import { STAFF_ROLES, type StaffRole, type StaffUser } from './types';

type Props = {
    staff: StaffUser[];
    activeStaffId: string;
    currentRole: StaffRole;
    onCreate: (input: { name: string; role: StaffRole; pin: string }) => string | null;
    onDelete: (id: string) => string | null;
    onSwitchUser: (id: string) => void;
};

export default function UsersPanel({
    staff,
    activeStaffId,
    currentRole,
    onCreate,
    onDelete,
    onSwitchUser,
}: Props) {
    const [name, setName] = useState('');
    const [role, setRole] = useState<StaffRole>('server');
    const [pin, setPin] = useState('');
    const [feedback, setFeedback] = useState<string | null>(null);

    const submit = () => {
        const error = onCreate({ name, role, pin });
        if (error) {
            setFeedback(error);
            return;
        }
        setName('');
        setPin('');
        setRole('server');
        setFeedback('User created successfully.');
    };

    return (
        <section className="menu-panel users-panel">
            <div className="menu-heading">
                <div>
                    <p className="eyebrow">Staff directory</p>
                    <h1>Create new user</h1>
                </div>
            </div>

            <div className="admin-grid">
                <form
                    className="admin-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit();
                    }}
                >
                    <h2>New staff member</h2>
                    <label>
                        Full name
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="e.g. Sam Rivera"
                            required
                        />
                    </label>
                    <label>
                        Role
                        <select
                            value={role}
                            onChange={(event) => setRole(event.target.value as StaffRole)}
                        >
                            {STAFF_ROLES.map((entry) => (
                                <option key={entry} value={entry}>
                                    {ROLE_LABELS[entry]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        PIN (4+ digits)
                        <input
                            value={pin}
                            onChange={(event) => setPin(event.target.value)}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            minLength={4}
                            placeholder="e.g. 4321"
                            required
                        />
                    </label>
                    <p className="fx-note">
                        Kitchen → ticket board only · Waiter/Server → Service orders · Admin/Manager →
                        full ops + user creation
                    </p>
                    <button className="generate-button" type="submit">
                        <Icon name="plus" /> Create user
                    </button>
                    {feedback && (
                        <div className="bill-message" role="status">
                            <strong>{feedback}</strong>
                        </div>
                    )}
                </form>

                <div className="admin-list">
                    <h2>Current users</h2>
                    {staff.map((user) => (
                        <div className="admin-item staff-item" key={user.id}>
                            <span className="avatar">{user.initials}</span>
                            <div>
                                <strong>{user.name}</strong>
                                <p>
                                    {ROLE_LABELS[user.role]} · PIN {user.pin}
                                    {user.id === activeStaffId ? ' · signed in' : ''}
                                </p>
                            </div>
                            <div className="admin-item-actions">
                                {user.id !== activeStaffId && (
                                    <button type="button" onClick={() => onSwitchUser(user.id)}>
                                        Switch
                                    </button>
                                )}
                                {(currentRole === 'manager' ||
                                    (currentRole === 'admin' && user.role !== 'manager')) &&
                                    user.id !== activeStaffId && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const error = onDelete(user.id);
                                                setFeedback(error ?? 'User removed.');
                                            }}
                                        >
                                            Delete
                                        </button>
                                    )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
