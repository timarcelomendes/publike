import { lerAvisosCsp } from "@/lib/aviso-csp";
import { MODO_DEMO } from "@/lib/config";
import { dentroDoLimite, embaralhar, enderecoDeQuemPediu } from "@/lib/servidor/limite";
import { criarClientePublico } from "@/lib/supabase/servidor";

// Os avisos da política de scripts (claude/plano-seguranca.md, item 1): o navegador manda sozinho o que bloquearia.
// Sem login; cada aviso vira uma contagem no banco (privado.avisos_csp). Responde sempre 204: o navegador não
// mostra nada à pessoa.

const MAXIMO_BYTES = 64 * 1024;
const VAZIO = () => new Response(null, { status: 204 });

export async function POST(pedido: Request) {
  if (MODO_DEMO) return VAZIO();
  if (!dentroDoLimite(`csp:${embaralhar(await enderecoDeQuemPediu())}`, 30, 60_000)) return VAZIO();
  const texto = await pedido.text().catch(() => "");
  if (!texto || texto.length > MAXIMO_BYTES) return VAZIO();
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return VAZIO();
  }
  const avisos = lerAvisosCsp(corpo);
  if (!avisos.length) return VAZIO();
  const banco = criarClientePublico();
  await Promise.all(
    avisos.map((a) =>
      banco.rpc("registrar_aviso_csp", { p_diretiva: a.diretiva, p_bloqueado: a.bloqueado, p_pagina: a.pagina }),
    ),
  ).catch(() => {});
  return VAZIO();
}
