import type { Metadata } from "next";
import { SHIPPING_NOTE } from "@/lib/products";

export const metadata: Metadata = {
  title: "Shipping policy",
};

export default function ShippingPolicyPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">Policy</p>
        <h1>Shipping</h1>
        <p>Clear timelines for United States orders.</p>
      </header>
      <div className="prose">
        <p>{SHIPPING_NOTE}</p>
        <h2>Processing</h2>
        <p>
          Orders are forwarded to our fulfillment partner the same business day
          when placed before 2:00 p.m. Eastern. Weekend orders forward on Monday.
        </p>
        <h2>Tracking</h2>
        <p>
          You receive a tracking email when the package ships. If tracking does
          not update for seven days after that email, contact support and we will
          replace or refund.
        </p>
        <h2>Duties and taxes</h2>
        <p>
          For US domestic shipping, listed prices do not include state sales tax.
          Applicable tax will be calculated at payment once a processor is
          connected.
        </p>
      </div>
    </div>
  );
}
