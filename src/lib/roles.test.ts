import { describe, expect, it } from "vitest";
import { ROLE_ORDER, accountTypeFor, defaultRole, isRole, pickStoredRole, resolveRole, roleFitsAccount, workspacePath } from "@/lib/roles";

describe("roles", () => {
  it("maps every role to one of the two database account types", () => {
    expect(ROLE_ORDER.map(accountTypeFor)).toEqual(["developer", "developer", "client", "developer"]);
  });

  it("only accepts real role names", () => {
    expect(isRole("freelancer")).toBe(true);
    expect(isRole("toString")).toBe(false);
    expect(isRole(null)).toBe(false);
  });

  it("keeps the stored role while it still fits the account type", () => {
    expect(resolveRole("freelancer", "developer")).toBe("freelancer");
    expect(resolveRole("personal", "developer")).toBe("personal");
    expect(resolveRole("client", "client")).toBe("client");
  });

  it("falls back to the old behaviour when the stored role no longer fits", () => {
    expect(resolveRole("freelancer", "client")).toBe("client");
    expect(resolveRole("client", "developer")).toBe("developer");
    expect(resolveRole("bogus", "developer")).toBe("developer");
    expect(resolveRole(null, "client")).toBe("client");
  });

  it("does not match any role to an account that has no type yet", () => {
    expect(roleFitsAccount("developer", null)).toBe(false);
    expect(defaultRole(null)).toBe("developer");
  });

  it("opens the studio for developer accounts and the dashboard for the rest", () => {
    expect(workspacePath("developer")).toBe("/studio");
    expect(workspacePath("client")).toBe("/dashboard");
    expect(workspacePath(null)).toBe("/dashboard");
  });
});

describe("pickStoredRole", () => {
  it("prefers the database role while it fits the account type", () => {
    expect(pickStoredRole("freelancer", "personal", "developer")).toBe("freelancer");
    expect(pickStoredRole("client", "developer", "client")).toBe("client");
  });

  it("uses the device role when the database has none or the table is not active yet", () => {
    expect(pickStoredRole(null, "personal", "developer")).toBe("personal");
    expect(pickStoredRole(undefined, "client", "client")).toBe("client");
  });

  it("ignores a database role that no longer fits the account type", () => {
    expect(pickStoredRole("freelancer", "client", "client")).toBe("client");
    expect(pickStoredRole("bogus", "personal", "developer")).toBe("personal");
  });

  it("returns null when neither source has a role", () => {
    expect(pickStoredRole(null, null, "developer")).toBeNull();
    expect(pickStoredRole(undefined, undefined, null)).toBeNull();
  });
});
