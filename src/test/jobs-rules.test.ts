import { describe, expect, it } from "vitest";
import { budgetLabel, canApply, canPostJob, canRespond, validBudget } from "@/lib/jobs";

const developer = { id: "dev", accountType: "developer" as const };
const client = { id: "client", accountType: "client" as const };
const guest = { id: null, accountType: null };
const openJob = { status: "open" as const, client_id: "client" };

describe("job rules", () => {
  it("lets only signed-in client accounts post a job", () => {
    expect(canPostJob(client)).toBe(true);
    expect(canPostJob(developer)).toBe(false);
    expect(canPostJob(guest)).toBe(false);
  });

  it("lets a developer apply once to an open job", () => {
    expect(canApply(openJob, developer, false)).toBe(true);
    expect(canApply(openJob, developer, true)).toBe(false);
  });

  it("blocks applying to closed or in-progress jobs", () => {
    expect(canApply({ ...openJob, status: "closed" }, developer, false)).toBe(false);
    expect(canApply({ ...openJob, status: "in_progress" }, developer, false)).toBe(false);
  });

  it("blocks clients, guests and the job owner from applying", () => {
    expect(canApply(openJob, client, false)).toBe(false);
    expect(canApply(openJob, guest, false)).toBe(false);
    expect(canApply({ status: "open", client_id: "dev" }, developer, false)).toBe(false);
  });

  it("lets only the job owner answer a pending application while the job is open", () => {
    expect(canRespond(openJob, { status: "pending" }, "client")).toBe(true);
    expect(canRespond(openJob, { status: "pending" }, "dev")).toBe(false);
    expect(canRespond(openJob, { status: "accepted" }, "client")).toBe(false);
    expect(canRespond({ ...openJob, status: "in_progress" }, { status: "pending" }, "client")).toBe(false);
  });

  it("rejects a maximum budget below the minimum", () => {
    expect(validBudget(1_000_000, 3_000_000)).toBe(true);
    expect(validBudget(3_000_000, 1_000_000)).toBe(false);
    expect(validBudget(-1, 0)).toBe(false);
    expect(validBudget(0, 0)).toBe(true);
  });

  it("labels budgets in rupiah, or Nego when none is set", () => {
    expect(budgetLabel(1_000_000, 3_000_000)).toBe("Rp1.000.000 – Rp3.000.000");
    expect(budgetLabel(500_000, 0)).toBe("Mulai Rp500.000");
    expect(budgetLabel(0, 2_000_000)).toBe("s/d Rp2.000.000");
    expect(budgetLabel(0, 0)).toBe("Nego");
  });
});
