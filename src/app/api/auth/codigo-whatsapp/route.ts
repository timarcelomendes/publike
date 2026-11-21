import { assinaturaDoGanchoValida, mandarCodigoPeloWhatsapp } from "@/lib/servidor/codigo-whatsapp";

// O gancho "Send SMS" do Supabase Auth (Authentication › Hooks › Send SMS hook, tipo HTTPS, com este endereço): o
// código de entrar pelo celular vai pelo WhatsApp do Publike (src/lib/servidor/codigo-whatsapp.ts). Sem o segredo
// SUPABASE_SMS_HOOK_SECRET na Vercel, ou com a assinatura errada, recusa.

const erro = (status: number, mensagem: string) =>
  Response.json({ error: { http_code: status, message: mensagem } }, { status });

// Para quem configura: abrir o endereço no navegador diz se o segredo está na Vercel, sem mostrar o valor.
export async function GET() {
  const segredo = (process.env.SUPABASE_SMS_HOOK_SECRET ?? "").trim();
  const celular = process.env.NEXT_PUBLIC_LOGIN_CELULAR === "true";
  const texto = !segredo
    ? "Falta o SUPABASE_SMS_HOOK_SECRET na Vercel (Production). Gere em Admin › Chaves › Gerar um segredo e faça um Redeploy."
    : !/^v1,whsec_[A-Za-z0-9+/=]{20,}$/.test(segredo)
      ? "O SUPABASE_SMS_HOOK_SECRET não está no formato v1,whsec_... Gere de novo em Admin › Chaves."
      : celular
        ? "Gancho do código pelo WhatsApp no ar: o segredo está na Vercel e o login por celular está ligado no site."
        : "O segredo está na Vercel. Falta NEXT_PUBLIC_LOGIN_CELULAR=true (e o Redeploy) para o site mostrar a entrada pelo celular.";
  return new Response(texto, { status: segredo ? 200 : 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function POST(request: Request) {
  const segredo = process.env.SUPABASE_SMS_HOOK_SECRET ?? "";
  if (!segredo.trim()) return erro(503, "O gancho do código não está configurado.");
  const corpo = await request.text();
  const valido = assinaturaDoGanchoValida(
    segredo,
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      assinatura: request.headers.get("webhook-signature"),
    },
    corpo,
  );
  if (!valido) return erro(401, "Assinatura inválida.");
  let telefone = "";
  let codigo = "";
  try {
    const dados = JSON.parse(corpo) as { user?: { phone?: string }; sms?: { otp?: string } };
    telefone = String(dados.user?.phone ?? "");
    codigo = String(dados.sms?.otp ?? "");
  } catch {
    return erro(400, "Corpo inválido.");
  }
  const r = await mandarCodigoPeloWhatsapp(telefone, codigo);
  return r.ok ? Response.json({}) : erro(r.status, r.mensagem);
}
