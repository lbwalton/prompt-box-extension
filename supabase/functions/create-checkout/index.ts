// Prompt Box Pro — create-checkout Edge Function.
// Verifies the caller's Supabase JWT, validates the requested plan against the
// env price allowlist, enforces the Founding Lifetime 100-cap server-side, and
// returns a Stripe Checkout Session URL. The extension only ever sees that URL.
// Secrets (STRIPE_SECRET_KEY) live in Edge Function secrets — never client-side.
import Stripe from "npm:stripe@17";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const SUCCESS_URL = "https://promptboxapp.com/?checkout=success";
const CANCEL_URL = "https://promptboxapp.com/?checkout=cancel";
const LIFETIME_CAP = 100;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const prices: Record<string, string | undefined> = {
    monthly: Deno.env.get("PRICE_MONTHLY"),
    annual: Deno.env.get("PRICE_ANNUAL"),
    lifetime: Deno.env.get("PRICE_LIFETIME"),
  };
  if (!supabaseUrl || !anonKey || !serviceKey || !stripeKey) {
    return json(500, { error: "server_misconfigured" });
  }

  // 1) Who is asking? Verify the user JWT against Supabase Auth.
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json(401, { error: "unauthorized" });
  const anonClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await anonClient.auth.getUser(jwt);
  const user = userData?.user;
  if (userError || !user) return json(401, { error: "unauthorized" });

  // 2) Which plan? Only the three env-configured price IDs are purchasable.
  let body: { plan?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "bad_request" });
  }
  const plan = typeof body.plan === "string" ? body.plan : "";
  if (!Object.prototype.hasOwnProperty.call(prices, plan)) {
    return json(400, { error: "unknown_plan" });
  }
  const priceId = prices[plan];
  if (!priceId) return json(500, { error: "server_misconfigured" });

  const serviceClient = createClient(supabaseUrl, serviceKey);

  try {
    // 3) Founding Lifetime cap — server-side gate (the webhook re-checks too).
    if (plan === "lifetime") {
      const { data: count, error: countError } = await serviceClient.rpc("lifetime_count");
      if (countError) return json(500, { error: "server_error" });
      if (typeof count === "number" && count >= LIFETIME_CAP) {
        return json(409, { error: "lifetime_sold_out" });
      }
    }

    // 4) Create or reuse the Stripe customer pinned to this profile.
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();
    if (profileError) return json(500, { error: "server_error" });

    const stripe = new Stripe(stripeKey, {
      httpClient: Stripe.createFetchHttpClient(),
    });

    let customerId: string | null = profile?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { user_id: user.id },
      });
      customerId = customer.id;
      const { error: updateError } = await serviceClient
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id);
      if (updateError) return json(500, { error: "server_error" });
    }

    // 5) Checkout Session. user_id travels in metadata AND client_reference_id
    //    so the webhook can resolve the profile without guessing by email.
    const session = await stripe.checkout.sessions.create({
      mode: plan === "lifetime" ? "payment" : "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { user_id: user.id, plan },
      ...(plan === "lifetime"
        ? {}
        : { subscription_data: { metadata: { user_id: user.id, plan } } }),
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
    });
    if (!session.url) return json(500, { error: "server_error" });
    return json(200, { url: session.url });
  } catch (_err) {
    // Stripe/network failures: never leak details to the client.
    return json(500, { error: "server_error" });
  }
});
