import { describe, expect, it } from "vitest";
import { ROLE_ORDER, accountTypeFor, defaultRole, isRole, resolveRole, roleFitsAccount, workspacePath } from "@/lib/roles";

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
