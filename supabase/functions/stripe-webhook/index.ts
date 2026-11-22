// TEMPLATE for real Stripe payments (not deployed, not tested). See SETUP.md, "Going live with Stripe".
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_live_... STRIPE_WEBHOOK_SECRET=whsec_...
// In Stripe: Developers > Webhooks > add endpoint https://<project-ref>.functions.supabase.co/stripe-webhook, event payment_intent.succeeded (and payment_intent.payment_failed)
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature")!;
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
  } catch (e) {
    return new Response("Bad signature", { status: 400 });
  }
  const pi = event.data.object as Stripe.PaymentIntent;
  const orderId = pi.metadata?.order_id;
  if (orderId && event.type === "payment_intent.succeeded") {
    await admin.from("orders").update({ payment_status: "paid", payment_method: "card", payment_provider: "stripe", payment_ref: pi.id,
      card_last4: (pi.latest_charge && typeof pi.latest_charge === "object") ? (pi.latest_charge as any).payment_method_details?.card?.last4 : null }).eq("id", orderId);
  } else if (orderId && event.type === "payment_intent.payment_failed") {
    await admin.from("orders").update({ payment_status: "failed" }).eq("id", orderId);
  }
  return new Response("ok");
});
