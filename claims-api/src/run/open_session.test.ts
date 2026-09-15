import { beforeEach, describe, expect, it, vi } from "vitest";

const spawn = vi.hoisted(() =>
  vi.fn(() => ({ on: vi.fn(), unref: vi.fn() })),
);

vi.mock("node:child_process", () => ({ spawn }));

const { factorySessionUrl, openFactorySession } = await import("./open_session.js");

describe("factorySessionUrl", () => {
  it("builds the Factory desktop deep link for the live session", () => {
    expect(factorySessionUrl("5fcc2798-d0da-413a-9d24-3b41c072e77b")).toBe(
      "factory-desktop://sessions/5fcc2798-d0da-413a-9d24-3b41c072e77b",
    );
  });

  it("encodes the id so the link cannot escape the sessions route", () => {
    expect(factorySessionUrl("a b/c")).toBe("factory-desktop://sessions/a%20b%2Fc");
  });
});

describe("openFactorySession", () => {
  beforeEach(() => {
    spawn.mockClear();
  });

  it("launches the deep link via macOS `open` on darwin, detached from the run", () => {
    openFactorySession("sess-1", "darwin");
    expect(spawn).toHaveBeenCalledExactlyOnceWith(
      "open",
      ["factory-desktop://sessions/sess-1"],
      expect.objectContaining({ stdio: "ignore", detached: true }),
    );
  });

  it("is a no-op on other platforms so runs never depend on it", () => {
    openFactorySession("sess-1", "linux");
    openFactorySession("sess-1", "win32");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("swallows launch failures instead of failing the run", () => {
    spawn.mockImplementationOnce(() => {
      throw new Error("spawn exploded");
    });
    expect(() => openFactorySession("sess-1", "darwin")).not.toThrow();
  });
});
