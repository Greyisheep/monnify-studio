/**
 * Behaviour contracts for intent -> Seller config mapping (#55, #15, D17).
 */
import { describe, expect, it } from "vitest";

import { intentToArtifactConfig } from "./intentConfig";
import { absoluteApiUrl, API_BASE } from "./api";

describe("intentToArtifactConfig", () => {
  it("copies known seller fields and ignores empties", () => {
    expect(
      intentToArtifactConfig({
        business_name: "Ada Thrift",
        product_name: "Denim",
        price_ngn: 12000,
      }),
    ).toEqual({
      business_name: "Ada Thrift",
      product_name: "Denim",
      price_ngn: 12000,
    });
  });

  it("coerces numeric strings for price", () => {
    expect(intentToArtifactConfig({ price_ngn: "4500" as unknown as number })).toEqual({
      business_name: undefined,
      product_name: undefined,
      price_ngn: 4500,
    });
  });

  it("drops blank business/product strings", () => {
    expect(
      intentToArtifactConfig({
        business_name: "",
        product_name: "",
      }),
    ).toEqual({
      business_name: undefined,
      product_name: undefined,
      price_ngn: undefined,
    });
  });
});

describe("absoluteApiUrl", () => {
  it("prefixes relative preview paths with API_BASE", () => {
    expect(absoluteApiUrl("/preview/art_1")).toBe(`${API_BASE}/preview/art_1`);
  });

  it("leaves absolute URLs alone", () => {
    expect(absoluteApiUrl("https://example.test/x")).toBe("https://example.test/x");
  });
});
