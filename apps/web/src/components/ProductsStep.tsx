"use client";

import { useState } from "react";

import type { ShopProduct } from "@/types";

export interface ProductsStepProps {
  initial: ShopProduct[];
  busy: boolean;
  onBack: () => void;
  onNext: (products: ShopProduct[]) => void;
}

const MAX_IMAGE_BYTES = 400_000;

function emptyRow(): ShopProduct {
  return { name: "", price_ngn: null, image_url: null };
}

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_IMAGE_BYTES) {
      reject(new Error("Image is too large. Use a file under 400 KB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read that image."));
    };
    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

export function ProductsStep({
  initial,
  busy,
  onBack,
  onNext,
}: ProductsStepProps) {
  const [rows, setRows] = useState<ShopProduct[]>(
    initial.length > 0 ? initial : [emptyRow()],
  );
  const [imageError, setImageError] = useState<string | null>(null);

  function updateRow(index: number, patch: Partial<ShopProduct>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setRows((current) => [...current, emptyRow()]);
  }

  async function onPickImage(index: number, file: File | null) {
    if (!file) return;
    setImageError(null);
    try {
      const image_url = await readImageAsDataUrl(file);
      updateRow(index, { image_url });
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "Could not use that image.",
      );
    }
  }

  const cleaned = rows
    .map((row) => ({
      ...row,
      name: row.name.trim(),
      price_ngn:
        row.price_ngn == null || Number.isNaN(Number(row.price_ngn))
          ? null
          : Number(row.price_ngn),
    }))
    .filter((row) => row.name.length > 0);

  return (
    <div className="studio-onboard__card">
      <header className="studio-path-gate__header">
        <h1>Add your products and services</h1>
        <p>
          Type a name and a price for each thing you sell. This is your shop;
          changes show up right away.
        </p>
      </header>

      <div className="studio-onboard__products">
        {rows.map((row, index) => (
          <div key={index} className="studio-onboard__product-row">
            <label className="studio-onboard__thumb">
              {row.image_url ? (
                <img src={row.image_url} alt="" />
              ) : (
                <span className="studio-onboard__thumb-plus" aria-hidden>
                  +
                </span>
              )}
              <input
                type="file"
                accept="image/*"
                aria-label={`Upload image for item ${index + 1}`}
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void onPickImage(index, file);
                  event.target.value = "";
                }}
              />
            </label>
            <input
              className="studio-onboard__name"
              placeholder="Product Name"
              value={row.name}
              disabled={busy}
              onChange={(event) => updateRow(index, { name: event.target.value })}
            />
            <label className="studio-onboard__price">
              <span>₦</span>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="Price"
                value={row.price_ngn ?? ""}
                disabled={busy}
                onChange={(event) =>
                  updateRow(index, {
                    price_ngn:
                      event.target.value === ""
                        ? null
                        : Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
        ))}
        {imageError && <p className="studio-onboard__error">{imageError}</p>}
        <button
          type="button"
          className="studio-onboard__add"
          disabled={busy}
          onClick={addRow}
        >
          + Add Item
        </button>
      </div>

      <footer className="studio-onboard__footer">
        <button
          type="button"
          className="studio-onboard__back"
          disabled={busy}
          onClick={onBack}
        >
          Back
        </button>
        <button
          type="button"
          className="studio-onboard__next"
          disabled={busy || cleaned.length === 0}
          onClick={() => onNext(cleaned)}
        >
          Next
        </button>
      </footer>
    </div>
  );
}
