import { after, connection } from "next/server";
import { chaveAceita, contaDoAviso, situacaoAsaas } from "@/lib/servidor/asaas";
import { enviarPushPendentes } from "@/lib/servidor/filas";
import { processarEvento } from "@/lib/servidor/pagamentos";

// Os avisos do Asaas (o "webhook", cadastrado no painel do Asaas com o token de ASAAS_WEBHOOK_TOKEN). O aviso
// só diz o que olhar: a cobrança, a assinatura e a nota são sempre lidas de novo na API do Asaas. Erro: 500,
// e o Asaas manda de novo (o mesmo aviso não é gravado duas vezes). A conta sandbox (das contas de teste) usa
// o mesmo endereço com o seu token (ASAAS_SANDBOX_WEBHOOK_TOKEN): é o token que diz de qual conta veio.
export const maxDuration = 60;

export async function POST(request: Request) {
  const conta = contaDoAviso(request.headers.get("asaas-access-token"));
  if (!conta) return Response.json({ ok: false }, { status: 401 });
  let evento: unknown;
  try {
    evento = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!evento || typeof evento !== "object") return Response.json({ ok: false }, { status: 400 });
  let erro: string | null;
  try {
    erro = await processarEvento(evento as Parameters<typeof processarEvento>[0], conta.sandbox);
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
    console.error("Publike: aviso de pagamento sem processar:", erro.slice(0, 300));
  }
  // os avisos de pagamento no celular
  after(() => enviarPushPendentes());
  return erro ? Response.json({ ok: false }, { status: 500 }) : Response.json({ ok: true });
}

/**
 * Para o Admin › Pagamentos conferir o site no ar: só sim ou não (nunca a chave nem o token). A conferência da
 * chave no Asaas fica guardada por 10 minutos.
 */
export async function GET() {
  await connection();
  const s = situacaoAsaas();
  const sb = s.sandbox;
  return Response.json(
    {
      publike: "pagamentos",
      producao: s.producao,
      chave: s.temChave,
      chaveAceita: await chaveAceita(),
      chaveDeOutroAmbiente: s.chaveDeOutroAmbiente,
      token: s.temToken,
      tokenComProblema: Boolean(s.problemaNoToken),
      // a conta sandbox das contas de teste (só com o site em produção)
      sandbox: s.producao
        ? {
            chave: sb.temChave,
            chaveAceita: sb.temChave ? await chaveAceita(true) : null,
            chaveDeOutroAmbiente: sb.chaveDeOutroAmbiente,
            token: sb.temToken,
            tokenComProblema: Boolean(sb.problemaNoToken),
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
