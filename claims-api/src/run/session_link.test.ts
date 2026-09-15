import { describe, expect, it } from "vitest";
import { factorySessionUrl } from "./session_link.js";

describe("factorySessionUrl", () => {
  it("builds the Factory browser URL for the session", () => {
    expect(factorySessionUrl("5fcc2798-d0da-413a-9d24-3b41c072e77b")).toBe(
      "https://app.factory.ai/sessions/5fcc2798-d0da-413a-9d24-3b41c072e77b",
    );
  });

  it("encodes the id so the link cannot escape the sessions route", () => {
    expect(factorySessionUrl("a b/c")).toBe("https://app.factory.ai/sessions/a%20b%2Fc");
  });
});
