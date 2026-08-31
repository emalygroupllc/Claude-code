// FlechaCard — adaptador da PaySuite
//
// TUDO o que é específico da PaySuite vive neste ficheiro. Se a API deles
// for diferente do que está aqui, é só este ficheiro que muda — as duas
// Edge Functions ficam iguais.
//
// Confirme os três valores abaixo no painel da PaySuite (secção API /
// Integração / Documentação) antes de pôr isto a receber dinheiro a sério:
//
//   1. PAYSUITE_BASE      — o endereço base da API
//   2. o formato do corpo do pedido em createPayment()
//   3. os nomes dos campos lidos em normalisePayment() e readWebhook()
//
// A chave secreta NUNCA aparece aqui nem no site. Vive nos secrets do
// Supabase:  supabase secrets set PAYSUITE_API_KEY=...

const PAYSUITE_BASE = Deno.env.get("PAYSUITE_BASE_URL") ??
  "https://paysuite.co.mz/api/v1";

const API_KEY = Deno.env.get("PAYSUITE_API_KEY") ?? "";

export interface PaymentRequest {
  reference: string;      // a nossa referência (FC-XXXXXX)
  amountMt: number;       // meticais, inteiro
  description: string;
  customerPhone: string;  // 84/85/86/87… — é para aqui que vai o push M-Pesa
  customerName: string;
  customerEmail?: string | null;
  returnUrl: string;      // onde a pessoa aterra depois de pagar
  callbackUrl: string;    // para onde a PaySuite manda a confirmação
}

export interface PaymentResult {
  gatewayRef: string;         // id da transação do lado deles
  redirectUrl: string | null; // se for pagamento por página/cartão
  status: PaymentStatus;      // normalmente "pending"
  raw: unknown;
}

export type PaymentStatus = "pending" | "paid" | "failed" | "cancelled";

function authHeaders(): HeadersInit {
  return {
    "Authorization": `Bearer ${API_KEY}`,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };
}

/** Traduz o estado que a PaySuite devolve para o nosso vocabulário. */
export function normaliseStatus(raw: unknown): PaymentStatus {
  const s = String(raw ?? "").toLowerCase().trim();
  if (["success", "successful", "paid", "completed", "complete", "approved"].includes(s)) {
    return "paid";
  }
  if (["failed", "failure", "error", "declined", "rejected"].includes(s)) {
    return "failed";
  }
  if (["cancelled", "canceled", "expired", "timeout"].includes(s)) {
    return "cancelled";
  }
  return "pending";
}

/** Encontra um campo procurando vários nomes possíveis, sem rebentar. */
function pick(obj: Record<string, unknown>, ...names: string[]): unknown {
  for (const n of names) {
    if (obj && obj[n] !== undefined && obj[n] !== null) return obj[n];
  }
  return undefined;
}

/** Desembrulha respostas do tipo { data: {...} } ou { result: {...} }. */
function unwrap(body: unknown): Record<string, unknown> {
  const b = (body ?? {}) as Record<string, unknown>;
  const inner = pick(b, "data", "result", "payment", "transaction");
  return (inner && typeof inner === "object" ? inner : b) as Record<string, unknown>;
}

/** Cria o pagamento. É este que dispara o pedido de PIN no telemóvel. */
export async function createPayment(req: PaymentRequest): Promise<PaymentResult> {
  if (!API_KEY) throw new Error("PAYSUITE_API_KEY nao esta configurada");

  const res = await fetch(`${PAYSUITE_BASE}/payments`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      amount: req.amountMt,
      currency: "MZN",
      reference: req.reference,
      description: req.description,
      msisdn: req.customerPhone,
      customer_name: req.customerName,
      customer_email: req.customerEmail ?? undefined,
      return_url: req.returnUrl,
      callback_url: req.callbackUrl,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = pick(body as Record<string, unknown>, "message", "error", "detail");
    throw new Error(`paysuite_${res.status}: ${msg ?? "sem detalhe"}`);
  }

  const d = unwrap(body);
  const ref = pick(d, "id", "transaction_id", "payment_id", "reference");
  if (!ref) throw new Error("paysuite: resposta sem id de transacao");

  return {
    gatewayRef: String(ref),
    redirectUrl: (pick(d, "redirect_url", "checkout_url", "payment_url", "url") as string) ?? null,
    status: normaliseStatus(pick(d, "status", "state")),
    raw: body,
  };
}

/**
 * Pergunta à PaySuite como está uma transação.
 *
 * É a peça de segurança mais importante de toda a integração: o webhook
 * é um pedido HTTP que qualquer pessoa na internet pode enviar. Nunca
 * marcamos uma encomenda como paga por o webhook o dizer — o webhook só
 * nos avisa de que vale a pena vir aqui perguntar.
 */
export async function fetchPayment(gatewayRef: string): Promise<PaymentResult> {
  if (!API_KEY) throw new Error("PAYSUITE_API_KEY nao esta configurada");

  const res = await fetch(
    `${PAYSUITE_BASE}/payments/${encodeURIComponent(gatewayRef)}`,
    { headers: authHeaders() },
  );

  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`paysuite_${res.status}`);

  const d = unwrap(body);
  return {
    gatewayRef: String(pick(d, "id", "transaction_id", "payment_id") ?? gatewayRef),
    redirectUrl: null,
    status: normaliseStatus(pick(d, "status", "state")),
    raw: body,
  };
}

/** Lê o essencial do corpo do webhook: quem é a transação e quanto foi. */
export function readWebhook(body: unknown): {
  gatewayRef: string | null;
  reference: string | null;
  amountMt: number | null;
  status: PaymentStatus;
} {
  const d = unwrap(body);
  const ref = pick(d, "id", "transaction_id", "payment_id");
  const ours = pick(d, "reference", "external_reference", "merchant_reference");
  const amt = pick(d, "amount", "value", "amount_paid");

  return {
    gatewayRef: ref === undefined ? null : String(ref),
    reference: ours === undefined ? null : String(ours),
    amountMt: amt === undefined ? null : Math.round(Number(amt)),
    status: normaliseStatus(pick(d, "status", "state", "event")),
  };
}

/**
 * Confirma que o webhook veio mesmo da PaySuite.
 *
 * Compara a assinatura enviada no cabeçalho com um HMAC-SHA256 do corpo,
 * feito com o segredo partilhado. Se a PaySuite usar outro cabeçalho ou
 * outro algoritmo, muda-se aqui.
 *
 * Sem PAYSUITE_WEBHOOK_SECRET configurado devolve false: mais vale
 * recusar tudo e reparar a configuração do que aceitar às cegas.
 */
export async function verifySignature(
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  const secret = Deno.env.get("PAYSUITE_WEBHOOK_SECRET") ?? "";
  if (!secret || !signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  const got = signature.replace(/^sha256=/i, "").trim().toLowerCase();
  if (got.length !== expected.length) return false;

  // Comparação de tempo constante: não deixa adivinhar a assinatura byte a byte.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
