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

describe("role capabilities", () => {
  it("keeps repositories away from client and freelancer", async () => {
    const { roleCan } = await import("@/lib/roles");
    expect(roleCan("client", "repos")).toBe(false);
    expect(roleCan("freelancer", "repos")).toBe(false);
    expect(roleCan("developer", "repos")).toBe(true);
    expect(roleCan("personal", "repos")).toBe(true);
  });

  it("lets only the client post jobs and only the developer sell karya or open a store", async () => {
    const { roleCan, ROLE_ORDER } = await import("@/lib/roles");
    expect(ROLE_ORDER.filter((r) => roleCan(r, "post_job"))).toEqual(["client"]);
    expect(ROLE_ORDER.filter((r) => roleCan(r, "karya"))).toEqual(["developer"]);
    expect(ROLE_ORDER.filter((r) => roleCan(r, "toko"))).toEqual(["developer"]);
  });

  it("gives every role at least one capability and the studio roles apply for jobs", async () => {
    const { ROLE_CAPS, roleCan } = await import("@/lib/roles");
    for (const caps of Object.values(ROLE_CAPS)) expect(caps.length).toBeGreaterThan(0);
    expect(roleCan("freelancer", "lamaran")).toBe(true);
    expect(roleCan("client", "lamaran")).toBe(false);
  });

  it("maps gated pages to a capability and leaves shared pages open", async () => {
    const { capabilityForPath } = await import("@/lib/roles");
    expect(capabilityForPath("/new")).toBe("repos");
    expect(capabilityForPath("/studio/karya/baru")).toBe("karya");
    expect(capabilityForPath("/studio/lamaran")).toBe("lamaran");
    expect(capabilityForPath("/lowongan/baru")).toBe("post_job");
    expect(capabilityForPath("/lowongan")).toBeNull();
    expect(capabilityForPath("/pesanan")).toBeNull();
    expect(capabilityForPath("/newsletter")).toBeNull();
  });

  it("uses the public role when it fits and falls back to the account type", async () => {
    const { publicRoleOf } = await import("@/lib/roles");
    expect(publicRoleOf({ active_role: "freelancer", account_type: "developer" })).toBe("freelancer");
    expect(publicRoleOf({ active_role: "freelancer", account_type: "client" })).toBe("client");
    expect(publicRoleOf({ active_role: null, account_type: "developer" })).toBe("developer");
    expect(publicRoleOf({ account_type: null })).toBe("developer");
  });

  it("shows no repository tab on client and freelancer profiles", async () => {
    const { PROFILE_TABS } = await import("@/lib/roles");
    expect(PROFILE_TABS.client).not.toContain("repos");
    expect(PROFILE_TABS.freelancer).not.toContain("repos");
    expect(PROFILE_TABS.freelancer).not.toContain("stars");
    expect(PROFILE_TABS.developer).toContain("repos");
  });
});
