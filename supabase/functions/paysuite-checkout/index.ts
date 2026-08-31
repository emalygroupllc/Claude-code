// FlechaCard — iniciar o pagamento de uma encomenda.
//
// O site manda só a referência da encomenda. O valor é lido da base de
// dados, nunca do pedido: assim ninguém compra um cartão de 3.999 MT por
// 1 MT a mexer no JavaScript.
//
//   supabase functions deploy paysuite-checkout

import { createClient } from "jsr:@supabase/supabase-js@2";
import { createPayment } from "../_shared/paysuite.ts";

const SITE_URL = Deno.env.get("SITE_URL") ?? "https://flechacard.com";

const cors = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let reference: string;
  try {
    const body = await req.json();
    reference = String(body?.reference ?? "").trim();
  } catch {
    return json({ error: "corpo_invalido" }, 400);
  }

  if (!/^FC-[A-Z0-9]{6}$/.test(reference)) {
    return json({ error: "referencia_invalida" }, 400);
  }

  // service-role: esta função precisa de ler e escrever a tabela orders,
  // que está fechada ao navegador. A chave só existe aqui no servidor.
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: order, error } = await db
    .from("orders")
    .select("id, reference, status, amount_mt, quantity, product_code, gateway_ref, customer_name, customer_phone, customer_email")
    .eq("reference", reference)
    .maybeSingle();

  if (error) return json({ error: "erro_base_dados" }, 500);
  if (!order) return json({ error: "encomenda_nao_encontrada" }, 404);

  if (order.status === "paid") {
    return json({ status: "paid", reference, alreadyPaid: true });
  }
  if (order.status !== "pending") {
    return json({ error: "encomenda_fechada", status: order.status }, 409);
  }
  // Já foi iniciado um pagamento para esta encomenda: não abrir outro,
  // senão a pessoa arrisca-se a pagar duas vezes.
  if (order.gateway_ref) {
    return json({ status: "pending", reference, alreadyStarted: true });
  }

  const { data: product } = await db
    .from("products").select("name").eq("code", order.product_code).maybeSingle();

  let result;
  try {
    result = await createPayment({
      reference: order.reference,
      amountMt: order.amount_mt,
      description: `${product?.name ?? "FlechaCard"} x${order.quantity} — ${order.reference}`,
      customerPhone: order.customer_phone,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      returnUrl: `${SITE_URL}/obrigado.html?ref=${encodeURIComponent(order.reference)}`,
      callbackUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/paysuite-webhook`,
    });
  } catch (e) {
    console.error("paysuite createPayment falhou", order.reference, e);
    return json({ error: "gateway_indisponivel" }, 502);
  }

  await db.from("orders").update({
    gateway_ref: result.gatewayRef,
    gateway_payload: result.raw,
    updated_at: new Date().toISOString(),
  }).eq("id", order.id);

  // redirectUrl preenchido → pagamento por página (cartão).
  // redirectUrl a null   → push M-Pesa/e-Mola já foi para o telemóvel.
  return json({
    status: "pending",
    reference: order.reference,
    amountMt: order.amount_mt,
    redirectUrl: result.redirectUrl,
  });
});
