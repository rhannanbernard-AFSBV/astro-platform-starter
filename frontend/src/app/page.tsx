import { ComplianceChat } from "@/components/ComplianceChat";
import { InvoiceOcrUpload } from "@/components/InvoiceOcrUpload";
import { PayrollRunForm } from "@/components/PayrollRunForm";
import { TenantSwitcher } from "@/components/TenantSwitcher";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span className={styles.brandMark}>Allyanna</span>
        <span className={styles.topMeta}>Sint Maarten · SXM compliance</span>
      </header>

      <section className={styles.hero} aria-label="Allyanna hero">
        <p className={styles.brandHero}>Allyanna</p>
        <h1 className={styles.headline}>
          Accounting clarity for Sint Maarten businesses.
        </h1>
        <p className={styles.support}>
          Multi-tenant compliance workspace — chat, payroll, and invoice intake
          wired to server-side Decimal tax math.
        </p>
        <div className={styles.ctaRow}>
          <a className={styles.ctaPrimary} href="#workspace">
            Open workspace
          </a>
          <a className={styles.ctaGhost} href="#payroll">
            Run payroll
          </a>
        </div>
        <div className={styles.horizon} aria-hidden="true" />
      </section>

      <main id="workspace" className={styles.workspace}>
        <div className={styles.sectionHead}>
          <h2>Workspace</h2>
          <p>
            Switch tenant context, then call the FastAPI routes. The browser
            never computes TOT, wage tax, or SZV.
          </p>
        </div>

        <div className={styles.grid}>
          <TenantSwitcher />
          <ComplianceChat />
          <div id="payroll" className={styles.gridWide}>
            <PayrollRunForm />
          </div>
          <div className={styles.gridWide}>
            <InvoiceOcrUpload />
          </div>
        </div>
      </main>
    </div>
  );
}
