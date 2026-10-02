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

      <fieldset className={styles.profileFieldset}>
        <legend className={styles.label}>Active workspace</legend>
        <div className={styles.profileList} role="radiogroup" aria-label="Active workspace">
          {profiles.map((p) => {
            const selected = p.id === active.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={selected ? styles.profileOptionActive : styles.profileOption}
                onClick={() => setActiveId(p.id)}
              >
                <span className={styles.profileKind}>
                  {p.kind === "master" ? "Master" : "Business"}
                </span>
                <span className={styles.profileName}>{p.name}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

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
