import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Returns policy",
};

export default function ReturnsPolicyPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">Policy</p>
        <h1>Returns</h1>
        <p>Damaged, wrong, or missing items—fixed without the runaround.</p>
      </header>
      <div className="prose">
        <h2>30-day window</h2>
        <p>
          If an item arrives damaged, incorrect, or not as described, email us
          within 30 days of delivery with photos. We will send a replacement or
          issue a refund.
        </p>
        <h2>Change of mind</h2>
        <p>
          Because items ship from a partner warehouse, unused returns for change
          of mind may require the customer to cover return shipping. Contact us
          before sending anything back.
        </p>
        <h2>Refund timing</h2>
        <p>
          Approved refunds post to the original payment method within 5–10
          business days after we confirm the issue.
        </p>
      </div>
    </div>
  );
}
