"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart";

type Props = {
  slug: string;
  label?: string;
  className?: string;
};

export function AddToCartButton({
  slug,
  label = "Add to cart",
  className = "btn btn-primary",
}: Props) {
  const { add } = useCart();
  const [toast, setToast] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => {
          add(slug, 1);
          setToast(true);
          window.setTimeout(() => setToast(false), 1800);
        }}
      >
        {label}
      </button>
      {toast ? <div className="toast">Added to cart</div> : null}
    </>
  );
}
