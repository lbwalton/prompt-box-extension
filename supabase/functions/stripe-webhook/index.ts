// Prompt Box Pro — stripe-webhook Edge Function.
// THE ONLY WRITER of is_pro / plan / stripe_customer_id (everything else is
// blocked by migration 0001's guard_profile_entitlement trigger). Deployed
// with --no-verify-jwt: Stripe calls it directly and the signature check IS
// the authentication — nothing in the payload is trusted before it passes.
import Stripe from "npm:stripe@17";
import { createClient } from "jsr:@supabase/supabase-js@2";

const LIFETIME_CAP = 100;

function ok(body: Record<string, unknown> = { received: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function fail(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const PRO_STATUSES = new Set(["active", "trialing"]);

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return fail(405, "method_not_allowed");

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!supabaseUrl || !serviceKey || !stripeKey || !webhookSecret) {
    return fail(500, "server_misconfigured");
  }

  // 1) Signature first. The raw body must be read as text BEFORE any parsing.
  const signature = req.headers.get("stripe-signature");
  if (!signature) return fail(400, "missing_signature");
  const rawBody = await req.text();
  const stripe = new Stripe(stripeKey, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch (_err) {
    return fail(400, "bad_signature");
  }

  const db = createClient(supabaseUrl, serviceKey);

  // 2) Idempotency: claim the event id before processing. A duplicate delivery
  //    hits the primary-key conflict and is acked without side effects. If
  //    processing fails below, the claim is released so Stripe's retry works.
  const { error: claimError } = await db
    .from("stripe_events")
    .insert({ id: event.id, type: event.type });
  if (claimError) {
    if (claimError.code === "23505") return ok({ received: true, duplicate: true });
    return fail(500, "event_ledger_error");
  }
  const releaseClaim = async () => {
    await db.from("stripe_events").delete().eq("id", event.id);
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id ?? session.client_reference_id;
        const plan = session.metadata?.plan ?? null;
        const customerId = typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null;
        if (!userId || !plan) {
          // Not one of ours (no metadata): ack and ignore rather than retry forever.
          console.error("checkout.session.completed without user_id/plan metadata", event.id);
          return ok({ received: true, ignored: true });
        }
        if (plan === "lifetime") {
          // Belt-and-suspenders: the cap gate is create-checkout. A PAID session
          // is always honored — if the cap raced, log loudly for manual follow-up.
          const { data: count } = await db.rpc("lifetime_count");
          if (typeof count === "number" && count >= LIFETIME_CAP) {
            console.error("lifetime cap exceeded by paid session", event.id, userId);
          }
        }
        const { error } = await db
          .from("profiles")
          .update({ is_pro: true, plan, stripe_customer_id: customerId })
          .eq("user_id", userId);
        if (error) throw error;
        return ok();
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const isPro = PRO_STATUSES.has(sub.status);
        // Never demote a Founding Lifetime profile because of a stray
        // subscription object on the same customer.
        const { error } = await db
          .from("profiles")
          .update({ is_pro: isPro })
          .eq("stripe_customer_id", customerId)
          .neq("plan", "lifetime");
        if (error) throw error;
        return ok();
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const { error } = await db
          .from("profiles")
          .update({ is_pro: false, plan: null })
          .eq("stripe_customer_id", customerId)
          .neq("plan", "lifetime");
        if (error) throw error;
        return ok();
      }

      default:
        // Unconfigured event type: ack so Stripe stops retrying it.
        return ok({ received: true, unhandled: event.type });
    }
  } catch (err) {
    console.error("webhook processing failed", event.id, err);
    await releaseClaim();
    return fail(500, "processing_error");
  }
});
