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
 * A stable, non-reversible label for one subscription: the first 8 hex characters of
 * SHA-256(endpoint), i.e. the leading 4 octets of the digest.
 *
 * The endpoint is not an identifier, it is the capability — anyone holding it can post to
 * that device's push channel — so it must never reach a log line. Two failing devices still
 * need to be told apart, and 32 bits of digest does that for a namespace the Worker caps at
 * 100 devices (birthday collision probability ~1.2e-6 at n = 100).
 *
 * Never throws: it is called from the failure paths, which must not manufacture a new one.
 */
async function endpointDigest(endpoint: string): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
    return [...new Uint8Array(digest).slice(0, 4)]
      .map((octet) => octet.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return "undigested";
  }
}

/**
 * Send one reminder. Never throws.
 *  - "sent"   the push service accepted it (2xx; RFC 8030 specifies 201)
 *  - "gone"   404/410: the subscription is dead, the caller deletes the device
 *  - "failed" anything else, logged; the caller leaves the key unsent so the next
 *             cron tick retries it while the reminder is still inside its window
 *
 * The logged lines carry the reminder key, the HTTP status or the error's constructor name,
 * and the endpoint digest. Never the thrown error's MESSAGE: pushforge interpolates the
 * subscription endpoint into its error text, and the endpoint is the capability for pushing
 * to that device. The VAPID private key and the subscription's p256dh/auth never reach the
 * log either.
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
    const digest = await endpointDigest(subscription.endpoint);
    console.warn(`push rejected: status=${response.status} key=${instant.key} endpoint=${digest}`);
    return "failed";
  } catch (error) {
    // `error.name` only. String(error) would carry the message, and pushforge embeds the
    // endpoint in it; a non-Error throw has no name worth trusting, so it is labelled.
    const name = error instanceof Error ? error.name : "NonError";
    const digest = await endpointDigest(subscription.endpoint);
    console.warn(`push threw: key=${instant.key} error=${name} endpoint=${digest}`);
    return "failed";
  }
}
