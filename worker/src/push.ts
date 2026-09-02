import { buildPushHTTPRequest } from "@pushforge/builder";
import type { PushSubscriptionRecord, ReminderInstant } from "./schedule";

/** The bindings sendPush needs. Env in index.ts extends this. */
export interface PushEnv {
  /** VAPID private key as a JWK **JSON string**. Secret; set with `wrangler secret put`. */
  VAPID_PRIVATE_JWK: string;
  /** RFC 8292 contact for the push service, e.g. "mailto:owner@example.com". */
  ADMIN_CONTACT: string;
}

export type PushOutcome = "sent" | "gone" | "failed";

/** GitHub Pages project path. The notification click target, resolved against the SW origin. */
export const APP_URL_PATH = "/FixThisInjustice/";

/**
 * Web Push message lifetime. Duration, SECONDS (RFC 8030 §5.2 sends it in the `TTL`
 * header, which is defined in seconds — not milliseconds like every timestamp in
 * schedule.ts). 3600 s = 1 h: a reminder is worthless once the session has passed.
 */
const TTL_SECONDS = 3600;

/**
 * Send one reminder. Never throws.
 *  - "sent"   the push service accepted it (2xx; RFC 8030 specifies 201)
 *  - "gone"   404/410: the subscription is dead, the caller deletes the device
 *  - "failed" anything else, logged; the caller leaves the key unsent so the next
 *             cron tick retries it while the reminder is still inside its window
 *
 * The logged lines carry only the status and the reminder key. The VAPID private
 * key and the subscription's p256dh/auth never reach the log, and pushforge's own
 * error messages interpolate only `kty`, `crv`, the endpoint and byte lengths.
 */
export async function sendPush(
  env: PushEnv,
  subscription: PushSubscriptionRecord,
  instant: ReminderInstant,
): Promise<PushOutcome> {
  try {
    const { endpoint, headers, body } = await buildPushHTTPRequest({
      // pushforge accepts a JWK object or a JSON string; passing the secret through
      // untouched avoids JSON.parse and the `as` cast it would need.
      privateJWK: env.VAPID_PRIVATE_JWK,
      subscription,
      message: {
        payload: {
          title: instant.title,
          body: instant.body,
          tag: instant.key,
          url: APP_URL_PATH,
        },
        adminContact: env.ADMIN_CONTACT,
        options: { ttl: TTL_SECONDS, urgency: "high" },
      },
    });

    const response = await fetch(endpoint, { method: "POST", headers, body });
    if (response.status === 201) return "sent";
    if (response.status === 404 || response.status === 410) return "gone";
    // Any other 2xx counts as sent. An outcome other than "sent" leaves the key out
    // of the `sent` map, so a service answering 200 would be re-sent every tick for
    // 15 min; treating all 2xx as sent is the only mapping consistent with §7's
    // "exactly one send across 30 cron ticks" gate.
    if (response.ok) return "sent";
    console.warn(`push rejected: status=${response.status} key=${instant.key}`);
    return "failed";
  } catch (error) {
    console.warn(`push threw: key=${instant.key} error=${String(error)}`);
    return "failed";
  }
}
