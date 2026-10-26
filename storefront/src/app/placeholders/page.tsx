"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useCatalog } from "@/lib/catalog-context";
import {
  emptyProduct,
  formatMoney,
  slugify,
  type Catalog,
  type Category,
  type Product,
} from "@/lib/catalog-types";

function dollarsToCents(value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function centsToDollars(cents: number | undefined): string {
  if (cents === undefined || cents === null) return "";
  return (cents / 100).toFixed(2);
}

export default function PlaceholdersEditorPage() {
  const router = useRouter();
  const { catalog: liveCatalog, setCatalog } = useCatalog();
  const [draft, setDraft] = useState<Catalog>(() =>
    structuredClone(liveCatalog),
  );
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [openSlug, setOpenSlug] = useState<string | null>(
    liveCatalog.products[0]?.slug ?? null,
  );

  const featuredSlug = useMemo(
    () => draft.products.find((p) => p.featured)?.slug ?? "",
    [draft.products],
  );

  function updateBrand<K extends keyof Catalog["brand"]>(
    key: K,
    value: Catalog["brand"][K],
  ) {
    setDraft((prev) => ({
      ...prev,
      brand: { ...prev.brand, [key]: value },
    }));
  }

  function updateHero<K extends keyof Catalog["hero"]>(
    key: K,
    value: Catalog["hero"][K],
  ) {
    setDraft((prev) => ({
      ...prev,
      hero: { ...prev.hero, [key]: value },
    }));
  }

  function updateCategory(index: number, patch: Partial<Category>) {
    setDraft((prev) => {
      const categories = prev.categories.map((cat, i) => {
        if (i !== index) return cat;
        const next = { ...cat, ...patch };
        if (patch.label && !patch.id) {
          next.id = slugify(patch.label) || cat.id;
        }
        return next;
      });
      const products = prev.products.map((p) => {
        const cat = categories.find((c) => c.id === p.category);
        if (!cat) return p;
        return { ...p, categoryLabel: cat.label };
      });
      return { ...prev, categories, products };
    });
  }

  function addCategory() {
    setDraft((prev) => ({
      ...prev,
      categories: [
        ...prev.categories,
        {
          id: `category-${prev.categories.length + 1}`,
          label: "New category",
          blurb: "Short department blurb",
        },
      ],
    }));
  }

  function removeCategory(index: number) {
    setDraft((prev) => {
      const removed = prev.categories[index];
      return {
        ...prev,
        categories: prev.categories.filter((_, i) => i !== index),
        products: prev.products.filter((p) => p.category !== removed.id),
      };
    });
  }

  function updateProduct(slug: string, patch: Partial<Product>) {
    setDraft((prev) => ({
      ...prev,
      products: prev.products.map((p) => {
        if (p.slug !== slug) {
          if (patch.featured) return { ...p, featured: false };
          return p;
        }
        const next = { ...p, ...patch };
        if (patch.category) {
          const cat = prev.categories.find((c) => c.id === patch.category);
          if (cat) next.categoryLabel = cat.label;
        }
        if (patch.name && !patch.slug) {
          // keep existing slug unless user edits slug field explicitly
        }
        return next;
      }),
    }));
  }

  function addProduct() {
    const cat = draft.categories[0];
    const product = emptyProduct(cat);
    setDraft((prev) => ({ ...prev, products: [...prev.products, product] }));
    setOpenSlug(product.slug);
  }

  function removeProduct(slug: string) {
    setDraft((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.slug !== slug),
    }));
    if (openSlug === slug) setOpenSlug(null);
  }

  function resetDraft() {
    setDraft(structuredClone(liveCatalog));
    setStatus("Reset to last saved catalog.");
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const res = await fetch("/api/placeholders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setCatalog(data as Catalog);
      setDraft(structuredClone(data as Catalog));
      setStatus("Saved to data/catalog.json. Storefront will refresh.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container editor">
      <header className="page-hero">
        <p className="eyebrow">Manual edit</p>
        <h1>Placeholder catalog</h1>
        <p>
          Edit brand, hero copy, departments, and products here. Saves to{" "}
          <code>storefront/data/catalog.json</code> — you can also edit that
          file directly in your IDE.
        </p>
      </header>

      <div className="editor-toolbar">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save placeholders"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={resetDraft}>
          Reset unsaved
        </button>
        <a href="/api/shopify/export?format=csv" className="btn btn-ghost">
          Download Shopify CSV
        </a>
        <Link href="/" className="btn btn-ghost">
          View storefront
        </Link>
        {status ? <p className="editor-status ok">{status}</p> : null}
        {error ? <p className="editor-status err">{error}</p> : null}
      </div>

      <section className="editor-card">
        <h2>Brand</h2>
        <div className="editor-grid">
          <label>
            Name
            <input
              value={draft.brand.name}
              onChange={(e) => updateBrand("name", e.target.value)}
            />
          </label>
          <label>
            Tagline
            <input
              value={draft.brand.tagline}
              onChange={(e) => updateBrand("tagline", e.target.value)}
            />
          </label>
          <label>
            Support email
            <input
              value={draft.brand.supportEmail}
              onChange={(e) => updateBrand("supportEmail", e.target.value)}
            />
          </label>
          <label>
            URL
            <input
              value={draft.brand.url}
              onChange={(e) => updateBrand("url", e.target.value)}
            />
          </label>
        </div>
        <label className="editor-full">
          Shipping note
          <textarea
            rows={3}
            value={draft.shippingNote}
            onChange={(e) =>
              setDraft((prev) => ({ ...prev, shippingNote: e.target.value }))
            }
          />
        </label>
      </section>

      <section className="editor-card">
        <h2>Landing hero</h2>
        <div className="editor-grid">
          <label className="editor-full">
            Headline
            <input
              value={draft.hero.headline}
              onChange={(e) => updateHero("headline", e.target.value)}
            />
          </label>
          <label className="editor-full">
            Supporting sentence
            <textarea
              rows={3}
              value={draft.hero.subhead}
              onChange={(e) => updateHero("subhead", e.target.value)}
            />
          </label>
          <label>
            Primary CTA
            <input
              value={draft.hero.primaryCta}
              onChange={(e) => updateHero("primaryCta", e.target.value)}
            />
          </label>
          <label>
            Secondary CTA
            <input
              value={draft.hero.secondaryCta}
              onChange={(e) => updateHero("secondaryCta", e.target.value)}
            />
          </label>
        </div>
      </section>

      <section className="editor-card">
        <div className="editor-card__head">
          <h2>Departments</h2>
          <button type="button" className="btn btn-ghost" onClick={addCategory}>
            Add department
          </button>
        </div>
        <div className="editor-stack">
          {draft.categories.map((cat, index) => (
            <div key={`${cat.id}-${index}`} className="editor-row">
              <label>
                Label
                <input
                  value={cat.label}
                  onChange={(e) =>
                    updateCategory(index, { label: e.target.value })
                  }
                />
              </label>
              <label>
                Id
                <input
                  value={cat.id}
                  onChange={(e) =>
                    updateCategory(index, { id: slugify(e.target.value) })
                  }
                />
              </label>
              <label className="editor-grow">
                Blurb
                <input
                  value={cat.blurb}
                  onChange={(e) =>
                    updateCategory(index, { blurb: e.target.value })
                  }
                />
              </label>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => removeCategory(index)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="editor-card">
        <div className="editor-card__head">
          <h2>Products ({draft.products.length})</h2>
          <button type="button" className="btn btn-ghost" onClick={addProduct}>
            Add product
          </button>
        </div>
        <div className="editor-stack">
          {draft.products.map((product) => {
            const open = openSlug === product.slug;
            return (
              <article key={product.slug} className="editor-product">
                <button
                  type="button"
                  className="editor-product__summary"
                  onClick={() => setOpenSlug(open ? null : product.slug)}
                >
                  <span>
                    <strong>{product.name}</strong>
                    <em>
                      {product.categoryLabel} ·{" "}
                      {formatMoney(product.priceCents)}
                      {product.featured ? " · featured" : ""}
                    </em>
                  </span>
                  <span>{open ? "Hide" : "Edit"}</span>
                </button>
                {open ? (
                  <div className="editor-product__body">
                    <div className="editor-grid">
                      <label>
                        Name
                        <input
                          value={product.name}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              name: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Slug
                        <input
                          value={product.slug}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              slug: slugify(e.target.value) || product.slug,
                            })
                          }
                        />
                      </label>
                      <label>
                        Department
                        <select
                          value={product.category}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              category: e.target.value,
                            })
                          }
                        >
                          {draft.categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Price (USD)
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={centsToDollars(product.priceCents)}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              priceCents: dollarsToCents(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Compare-at (optional)
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={centsToDollars(product.compareAtCents)}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              compareAtCents: e.target.value
                                ? dollarsToCents(e.target.value)
                                : undefined,
                            })
                          }
                        />
                      </label>
                      <label>
                        Ships in
                        <input
                          value={product.shipsInDays}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              shipsInDays: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Accent color
                        <input
                          value={product.accent}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              accent: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Weight
                        <input
                          value={product.weight}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              weight: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Vendor (Shopify)
                        <input
                          value={product.vendor || ""}
                          placeholder={draft.brand.name}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              vendor: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        SKU
                        <input
                          value={product.sku || ""}
                          placeholder={product.slug.toUpperCase()}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              sku: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Shopify variant GID
                        <input
                          value={product.shopifyVariantId || ""}
                          placeholder="gid://shopify/ProductVariant/…"
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              shopifyVariantId: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Image URL
                        <input
                          value={product.imageSrc || ""}
                          placeholder="https://…"
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              imageSrc: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label>
                        Status
                        <select
                          value={product.status || "active"}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              status: e.target.value as Product["status"],
                            })
                          }
                        >
                          <option value="active">active</option>
                          <option value="draft">draft</option>
                          <option value="archived">archived</option>
                        </select>
                      </label>
                      <label className="editor-full">
                        Tagline
                        <input
                          value={product.tagline}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              tagline: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="editor-full">
                        Benefit
                        <textarea
                          rows={2}
                          value={product.benefit}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              benefit: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="editor-full">
                        Problem
                        <textarea
                          rows={2}
                          value={product.problem}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              problem: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="editor-full">
                        Materials
                        <input
                          value={product.materials}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              materials: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="editor-full">
                        Includes (comma-separated)
                        <input
                          value={product.includes.join(", ")}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              includes: e.target.value
                                .split(",")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </label>
                      <label className="editor-check">
                        <input
                          type="checkbox"
                          checked={product.slug === featuredSlug}
                          onChange={(e) =>
                            updateProduct(product.slug, {
                              featured: e.target.checked,
                            })
                          }
                        />
                        Featured on landing page
                      </label>
                    </div>
                    <div className="hero__actions" style={{ marginTop: "1rem" }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => removeProduct(product.slug)}
                      >
                        Delete product
                      </button>
                      <Link
                        href={`/product/${product.slug}`}
                        className="btn btn-ghost"
                      >
                        Preview PDP
                      </Link>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      <section className="editor-card">
        <h2>Hand-edit the JSON file</h2>
        <p style={{ color: "var(--ink-soft)", marginBottom: "0.75rem" }}>
          Path: <code>storefront/data/catalog.json</code>. After editing the
          file on disk, refresh the browser. The Save button above writes the
          same file.
        </p>
        <pre className="editor-json">{JSON.stringify(draft, null, 2)}</pre>
      </section>
    </div>
  );
}
