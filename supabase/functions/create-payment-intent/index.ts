// TEMPLATE for real Stripe payments (not deployed, not tested). See SETUP.md, "Going live with Stripe".
// Deploy:  supabase functions deploy create-payment-intent
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_live_...   (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically)
import Stripe from "https://esm.sh/stripe@14?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2024-06-20" });
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "https://teacraft.co.nz", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { order_id } = await req.json();
    // The amount always comes from the database, never from the browser.
    const { data: order, error } = await admin.from("orders").select("id,order_number,total,payment_status,customer_email").eq("id", order_id).single();
    if (error || !order || order.payment_status === "paid") throw new Error("Order not payable");
    const intent = await stripe.paymentIntents.create({
      amount: Math.round(Number(order.total) * 100), currency: "nzd", receipt_email: order.customer_email,
      automatic_payment_methods: { enabled: true }, metadata: { order_id: order.id, order_number: order.order_number },
    });
    return new Response(JSON.stringify({ client_secret: intent.client_secret }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
