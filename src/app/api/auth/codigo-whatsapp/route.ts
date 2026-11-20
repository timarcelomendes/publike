import { assinaturaDoGanchoValida, mandarCodigoPeloWhatsapp } from "@/lib/servidor/codigo-whatsapp";

// O gancho "Send SMS" do Supabase Auth (Authentication › Hooks › Send SMS hook, tipo HTTPS, com este endereço): o
// código de entrar pelo celular vai pelo WhatsApp do Publike (src/lib/servidor/codigo-whatsapp.ts). Sem o segredo
// SUPABASE_SMS_HOOK_SECRET na Vercel, ou com a assinatura errada, recusa.

const erro = (status: number, mensagem: string) =>
  Response.json({ error: { http_code: status, message: mensagem } }, { status });

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
