"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { ErroIA, iaConfigurada, MODELO_PADRAO } from "@/lib/ia/openai";
import { sugerirTexto, type AnuncioParaIA } from "@/lib/ia/tarefas";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export type SugestaoTexto = { ok: true; titulo: string; descricao: string } | { ok: false; erro: string };

export type RascunhoAnuncio = Omit<AnuncioParaIA, "autor_tipo">;

function limpar(r: RascunhoAnuncio): AnuncioParaIA {
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    tipo: r.tipo === "servico" ? "servico" : "vaga",
    titulo: t(r.titulo, 90),
    descricao: t(r.descricao, 3000),
    categoria: t(r.categoria, 40),
    regime: t(r.regime, 20) || null,
    pagamento_valor: n(r.pagamento_valor),
    pagamento_unidade: t(r.pagamento_unidade, 20) || null,
    beneficios: t(r.beneficios, 120) || null,
    horario: t(r.horario, 120) || null,
    vagas: n(r.vagas),
    cidade: t(r.cidade, 60) || "Goiânia",
    bairro: t(r.bairro, 80),
  };
}

/** "Melhorar texto": a IA reescreve título e descrição. Nada é salvo; a pessoa escolhe se usa. */
export async function melhorarTextoAnuncio(rascunho: RascunhoAnuncio): Promise<SugestaoTexto> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!iaConfigurada()) return { ok: false, erro: "A ajuda da IA não está disponível agora." };
  const entrada = limpar(rascunho);
  if (entrada.titulo.length + entrada.descricao.length < 15) {
    return { ok: false, erro: "Escreva um rascunho do título e da descrição primeiro. A IA melhora o seu texto." };
  }

  let modelo = MODELO_PADRAO;
  const admin = await clienteAdminOuNulo();
  if (admin) {
    const { data } = await admin.rpc("admin_config");
    modelo = data?.[0]?.ia_modelo ?? modelo;
  } else {
    const usuario = await obterUsuario();
    if (!usuario) return { ok: false, erro: "Entre na sua conta para usar a ajuda da IA." };
    const supabase = await criarClienteServidor();
    const { error } = await supabase.rpc("usar_ia_texto");
    if (error) return { ok: false, erro: mensagemDeErro(error) };
    const { data } = await supabase.rpc("config_publica");
    modelo = data?.[0]?.ia_modelo ?? modelo;
  }

  try {
    const s = await sugerirTexto(entrada, modelo);
    return { ok: true, ...s };
  } catch (e) {
    return { ok: false, erro: e instanceof ErroIA ? e.message : "A IA não conseguiu ajudar agora. Tente de novo." };
  }
}
