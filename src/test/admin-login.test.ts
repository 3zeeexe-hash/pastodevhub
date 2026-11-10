import { describe, expect, it } from "vitest";
import { adminEmailFor, checkAdminCredentials } from "@/lib/admin-rules";

const env = { username: "Admin", password: "Rahasia-123" };

describe("admin login", () => {
  it("accepts the configured username and password", () => {
    expect(checkAdminCredentials({ username: "Admin", password: "Rahasia-123" }, env)).toBe(true);
  });

  it("ignores username case and surrounding spaces", () => {
    expect(checkAdminCredentials({ username: "  admin ", password: "Rahasia-123" }, env)).toBe(true);
  });

  it("rejects a wrong password, including different letter case", () => {
    expect(checkAdminCredentials({ username: "admin", password: "rahasia-123" }, env)).toBe(false);
    expect(checkAdminCredentials({ username: "admin", password: "Rahasia-1234" }, env)).toBe(false);
  });

  it("rejects a wrong username", () => {
    expect(checkAdminCredentials({ username: "root", password: "Rahasia-123" }, env)).toBe(false);
  });

  it("refuses every login when admin login is not configured", () => {
    expect(checkAdminCredentials({ username: "", password: "" }, {})).toBe(false);
    expect(checkAdminCredentials({ username: "admin", password: "x" }, { username: "admin" })).toBe(false);
  });

  it("uses a fixed internal email for the admin account", () => {
    expect(adminEmailFor("Admin")).toBe("admin@admin.pastodev.app");
    expect(adminEmailFor("admin", "Owner@Example.com")).toBe("owner@example.com");
    expect(adminEmailFor("admin", "not-an-email")).toBe("admin@admin.pastodev.app");
  });
});
