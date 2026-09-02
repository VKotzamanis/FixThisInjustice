import { describe, expect, it } from "vitest";
import wranglerToml from "../wrangler.toml?raw";
import packageJson from "../package.json?raw";

describe("wrangler.toml", () => {
  it("names the Worker and its entry point", () => {
    expect(wranglerToml).toContain('name = "fti-reminders"');
    expect(wranglerToml).toContain('main = "src/index.ts"');
  });

  it("pins a compatibility date and enables nodejs_compat", () => {
    expect(wranglerToml).toMatch(/^compatibility_date = "\d{4}-\d{2}-\d{2}"$/m);
    expect(wranglerToml).toContain('compatibility_flags = ["nodejs_compat"]');
  });

  it("binds the REMINDERS KV namespace with a non-empty id", () => {
    expect(wranglerToml).toMatch(
      /\[\[kv_namespaces\]\]\nbinding = "REMINDERS"\nid = "[^"]+"/,
    );
  });

  it("runs the cron every minute", () => {
    expect(wranglerToml).toContain("[triggers]");
    expect(wranglerToml).toContain('crons = ["* * * * *"]');
  });

  it("declares the three plain vars", () => {
    expect(wranglerToml).toMatch(/^VAPID_PUBLIC_KEY = "/m);
    expect(wranglerToml).toMatch(/^ADMIN_CONTACT = "mailto:/m);
    expect(wranglerToml).toMatch(/^ALLOWED_ORIGIN = "https:\/\//m);
  });

  it("never stores the private key in the tracked config file", () => {
    expect(wranglerToml).not.toContain("VAPID_PRIVATE_JWK");
  });
});

describe("package.json", () => {
  it("pins the versions the master plan requires", () => {
    expect(packageJson).toContain('"@pushforge/builder": "^2.0.5"');
    expect(packageJson).toContain('"wrangler": "^4.128.0"');
    expect(packageJson).toContain('"@cloudflare/workers-types": "^5.20260901.1"');
    expect(packageJson).toContain('"typescript": "^5.9.3"');
    expect(packageJson).toContain('"vitest": "^4.1.11"');
  });
});
