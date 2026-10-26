import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container">
      <header className="page-hero">
        <p className="eyebrow">404</p>
        <h1>Page not found</h1>
        <p>That desk tool is not in the kit.</p>
      </header>
      <div className="empty-state">
        <Link href="/shop" className="btn btn-primary">
          Back to shop
        </Link>
      </div>
    </div>
  );
}