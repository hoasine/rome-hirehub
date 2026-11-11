import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeExternalUrl, validateUtf8 } from "../lib/urls";
import {
  STALE_AFTER_SECONDS,
  formatPayment,
  isStale,
} from "../lib/engagement-contract";
import type { Engagement } from "../lib/types";

const zero = "0x0000000000000000000000000000000000000000" as const;

function engagement(overrides: Partial<Engagement> = {}): Engagement {
  return {
    id: 1n,
    employerProfileId: 1n,
    contributorProfileId: 2n,
    employer: zero,
    contributor: zero,
    paymentToken: zero,
    paymentAmount: 0n,
    token: null,
    title: "Milestone",
    description: "",
    evidenceUri: "",
    evidenceHash: `0x${"0".repeat(64)}`,
    review: "",
    createdAt: 0,
    updatedAt: 1_000,
    rating: 0,
    status: "accepted",
    ...overrides,
  };
}

describe("frontend URL policy", () => {
  it("allows only HTTPS and well-formed IPFS evidence", () => {
    assert.equal(safeExternalUrl("https://github.com/x/y"), "https://github.com/x/y");
    assert.equal(
      safeExternalUrl("ipfs://bafybeigdyrzt/proof.json"),
      "https://ipfs.io/ipfs/bafybeigdyrzt/proof.json",
    );
    assert.equal(safeExternalUrl("http://example.com"), null);
    assert.equal(safeExternalUrl("javascript:alert(1)"), null);
    assert.equal(safeExternalUrl("data:text/html,hi"), null);
    assert.equal(safeExternalUrl("https://user:pass@example.com"), null);
    assert.equal(safeExternalUrl("ipfs://../../etc"), null);
    assert.equal(safeExternalUrl("not a url"), null);
  });

  it("measures on-chain limits in UTF-8 bytes", () => {
    assert.equal(validateUtf8("abcd", 4, "Name"), null);
    assert.match(validateUtf8("Đức", 3, "Name") ?? "", /3-byte/);
  });
});

describe("engagement presentation", () => {
  it("formats escrow with token decimals and symbol", () => {
    assert.equal(formatPayment(engagement()), null);
    assert.equal(
      formatPayment(
        engagement({
          paymentAmount: 2_500_000n,
          token: { address: zero, decimals: 6, symbol: "USDC" },
        }),
      ),
      "2.5 USDC",
    );
    assert.equal(
      formatPayment(engagement({ paymentAmount: 7n })),
      "7 base units",
    );
  });

  it("marks only accepted or revision work stale after the reclaim window", () => {
    const deadline = 1_000 + STALE_AFTER_SECONDS;
    assert.equal(isStale(engagement(), deadline - 1), false);
    assert.equal(isStale(engagement(), deadline), true);
    assert.equal(isStale(engagement({ status: "revision-requested" }), deadline), true);
    assert.equal(isStale(engagement({ status: "submitted" }), deadline), false);
    assert.equal(isStale(engagement({ status: "disputed" }), deadline), false);
  });
});
