"use server";

import { revalidatePath } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import type { ListaParaImportar, ResultadoImportacao } from "@/lib/importar-gupy";
import { gravarVaga } from "@/lib/servidor/comeca-ja";
import { marcarConversao } from "@/lib/servidor/conversao";
import { importarDaGupy, linksJaNoPublike, listarDaGupy } from "@/lib/servidor/importar-gupy";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Painel › Vagas › "Importar da Gupy" (claude/plano-candidatura-no-site-da-empresa.md): a empresa cola o link da
// página de vagas dela na Gupy, escolhe as vagas e publica todas de uma vez, com a candidatura no site da empresa.
// As regras são as de publicar uma vaga (inclusive o limite de vagas por dia, que o banco confere).

/** A conta que publica: empresa, comércio ou agência (a agência verificada publica até 50 por dia; o resto, 10). */
async function contaQueImporta() {
  const usuario = await obterUsuario();
  if (!usuario) return { erro: "Entre na sua conta para importar as vagas." } as const;
  const perfil = await obterMeuPerfil().catch(() => null);
  if (!perfil) return { erro: "Complete o perfil da empresa antes de importar as vagas." } as const;
  if (perfil.tipo === "pessoa") return { erro: "A importação da Gupy é para empresas, comércios e agências." } as const;
  return {
    id: usuario.id,
    perfil,
    maximo: perfil.tipo === "agencia" && perfil.verificado ? 50 : 10,
  } as const;
}

export async function listarVagasDaGupy(link: string): Promise<ListaParaImportar> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (typeof link !== "string" || !link.trim()) return { ok: false, erro: "Cole o link da página de vagas na Gupy." };
  const conta = await contaQueImporta();
  if ("erro" in conta) return { ok: false, erro: conta.erro ?? "Entre na sua conta." };
  const existentes = await linksJaNoPublike(await criarClienteServidor(), conta.id);
  return listarDaGupy(link, existentes, conta.maximo);
}

export async function importarVagasDaGupy(links: string[], confirmou: boolean): Promise<ResultadoImportacao> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (confirmou !== true) return { ok: false, erro: "Confirme que as vagas são da sua empresa." };
  const conta = await contaQueImporta();
  if ("erro" in conta) return { ok: false, erro: conta.erro ?? "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const existentes = await linksJaNoPublike(supabase, conta.id);
  const r = await importarDaGupy({
    links,
    existentes,
    gravar: (registro) =>
      gravarVaga(registro, (dados) =>
        supabase
          .from("anuncios")
          .insert({ ...dados, tipo: "vaga" })
          .select("id")
          .single(),
      ),
    base: { cidade: conta.perfil.cidade, bairro: conta.perfil.bairro },
    agencia: conta.perfil.tipo === "agencia",
    equipe: false,
    maximo: conta.maximo,
  });
  if (r.ok && r.publicadas) {
    await marcarConversao("vaga");
    revalidatePath("/");
  }
  return r;
}
