"use client";

import { useTenant } from "@/lib/tenant-context";
import styles from "./panels.module.css";

export function TenantSwitcher() {
  const { profiles, active, setActiveId } = useTenant();

  return (
    <form
      className={styles.formCard}
      onSubmit={(e) => e.preventDefault()}
      aria-labelledby="tenant-switcher-title"
    >
      <div className={styles.formHeader}>
        <h2 id="tenant-switcher-title" className={styles.formTitle}>
          Tenant context
        </h2>
        <p className={styles.formLead}>
          Master Account switches into a business profile. Every API call sends{" "}
          <code>X-Tenant-ID</code>.
        </p>
      </div>

      <label className={styles.label} htmlFor="tenant-profile">
        Active workspace
      </label>
      <select
        id="tenant-profile"
        className={styles.select}
        value={active.id}
        onChange={(e) => setActiveId(e.target.value)}
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.kind === "master" ? "Master · " : "Business · "}
            {p.name}
          </option>
        ))}
      </select>

      <dl className={styles.metaList}>
        <div>
          <dt>Tenant ID</dt>
          <dd>
            <code>{active.id}</code>
          </dd>
        </div>
        <div>
          <dt>Role</dt>
          <dd>{active.role.replaceAll("_", " ")}</dd>
        </div>
      </dl>
    </form>
  );
}
