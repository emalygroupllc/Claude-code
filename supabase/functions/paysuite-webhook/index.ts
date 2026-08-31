// FlechaCard — confirmação de pagamento vinda da PaySuite.
//
// Este endereço é público: qualquer pessoa na internet lhe pode bater à
// porta a dizer "a encomenda FC-ABC123 está paga". Por isso o corpo do
// webhook não decide nada. Faz duas coisas e mais nenhuma:
//
//   1. confirma a assinatura;
//   2. usa o id da transação para ir PERGUNTAR à PaySuite o estado real.
//
// Só a resposta dessa pergunta marca uma encomenda como paga — e só se o
// valor bater certo com o que está guardado.
//
//   supabase functions deploy paysuite-webhook --no-verify-jwt
//
// (--no-verify-jwt porque quem chama é a PaySuite, que não tem sessão
// Supabase. A autenticação é a assinatura, não o JWT.)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { fetchPayment, readWebhook, verifySignature } from "../_shared/paysuite.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const raw = await req.text();

  const signature = req.headers.get("x-paysuite-signature")
    ?? req.headers.get("x-signature")
    ?? req.headers.get("signature");

  if (!(await verifySignature(raw, signature))) {
    console.warn("webhook com assinatura invalida rejeitado");
    return new Response("assinatura_invalida", { status: 401 });
  }

  let hook;
  try {
    hook = readWebhook(JSON.parse(raw));
  } catch {
    return new Response("corpo_invalido", { status: 400 });
  }

  if (!hook.gatewayRef && !hook.reference) {
    return new Response("sem_referencia", { status: 400 });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const q = db.from("orders").select("id, reference, status, amount_mt, gateway_ref");
  const { data: order } = hook.gatewayRef
    ? await q.eq("gateway_ref", hook.gatewayRef).maybeSingle()
    : await q.eq("reference", hook.reference!).maybeSingle();

  if (!order) {
    console.warn("webhook para encomenda desconhecida", hook.gatewayRef, hook.reference);
    return new Response("ok", { status: 200 }); // 200 para a PaySuite não repetir para sempre
  }

  // Já tratada: a PaySuite reenvia webhooks, e reenviar não pode pagar
  // duas vezes nem reabrir uma encomenda fechada.
  if (order.status !== "pending") return new Response("ok", { status: 200 });

  const gatewayRef = order.gateway_ref ?? hook.gatewayRef;
  if (!gatewayRef) return new Response("ok", { status: 200 });

  // A verificação que conta.
  let truth;
  try {
    truth = await fetchPayment(gatewayRef);
  } catch (e) {
    console.error("nao foi possivel confirmar com a paysuite", gatewayRef, e);
    return new Response("retry", { status: 503 }); // que a PaySuite tente outra vez
  }

  if (truth.status === "pending") return new Response("ok", { status: 200 });

  // Pago, mas por um valor diferente do que devia: não fica pago. Fica
  // para olho humano — pode ser um pagamento parcial ou uma tentativa de
  // burla.
  if (truth.status === "paid" && hook.amountMt !== null && hook.amountMt !== order.amount_mt) {
    console.error("valor nao bate", order.reference, "esperado", order.amount_mt, "recebido", hook.amountMt);
    await db.from("orders").update({
      status: "failed",
      gateway_payload: truth.raw,
      updated_at: new Date().toISOString(),
    }).eq("id", order.id).eq("status", "pending");
    return new Response("ok", { status: 200 });
  }

  await db.from("orders").update({
    status: truth.status,
    paid_at: truth.status === "paid" ? new Date().toISOString() : null,
    gateway_payload: truth.raw,
    updated_at: new Date().toISOString(),
  }).eq("id", order.id).eq("status", "pending"); // só sai de pending uma vez

  console.log("encomenda", order.reference, "->", truth.status);
  return new Response("ok", { status: 200 });
});
