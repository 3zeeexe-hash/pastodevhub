import { describe, expect, it } from "vitest";
import { parseFirebaseConfig, parseServiceAccount } from "./firebase-config";

const KEY = "AIzaSyD-abcdefghijklmnopqrstuvwxyz12345";

describe("parseFirebaseConfig", () => {
  it("reads the console snippet", () => {
    const cfg = parseFirebaseConfig(`const firebaseConfig = {\n  apiKey: "${KEY}",\n  authDomain: "pastodev-1.firebaseapp.com",\n  projectId: "pastodev-1",\n  appId: "1:123:web:abc"\n};`);
    expect(cfg).toEqual({ apiKey: KEY, authDomain: "pastodev-1.firebaseapp.com", projectId: "pastodev-1", appId: "1:123:web:abc" });
  });
  it("reads JSON and fills a default authDomain", () => {
    expect(parseFirebaseConfig(JSON.stringify({ apiKey: KEY, projectId: "pastodev-1" })).authDomain).toBe("pastodev-1.firebaseapp.com");
  });
  it("reads google-services.json", () => {
    const cfg = parseFirebaseConfig(JSON.stringify({ project_info: { project_id: "pastodev-1", project_number: "123" }, client: [{ api_key: [{ current_key: KEY }] }] }));
    expect(cfg.projectId).toBe("pastodev-1");
    expect(cfg.apiKey).toBe(KEY);
  });
  it("rejects a service account pasted in the wrong box", () => {
    expect(() => parseFirebaseConfig(JSON.stringify({ type: "service_account" }))).toThrow(/service account/);
  });
  it("rejects a config without apiKey", () => {
    expect(() => parseFirebaseConfig(`{ "projectId": "pastodev-1" }`)).toThrow(/apiKey/);
  });
});

describe("parseServiceAccount", () => {
  const sa = { type: "service_account", project_id: "pastodev-1", client_email: "firebase-adminsdk@pastodev-1.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n" };
  it("accepts a valid key file", () => {
    expect(parseServiceAccount(JSON.stringify(sa))).toEqual({ projectId: "pastodev-1", clientEmail: sa.client_email });
  });
  it("rejects other JSON", () => {
    expect(() => parseServiceAccount(JSON.stringify({ ...sa, type: "authorized_user" }))).toThrow(/bukan service account/);
  });
});
