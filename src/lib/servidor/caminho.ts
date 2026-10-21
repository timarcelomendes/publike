import "server-only";
import { cache } from "react";
import { esperaResposta } from "@/lib/constantes";
import { listarMeusAnuncios, listarMeusCandidatos, obterMeuPerfil } from "@/lib/dados";
import { clientesDasVagas, listarMeusClientes } from "@/lib/servidor/clientes";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { Cliente } from "@/lib/clientes";
import type { MeuAnuncio } from "@/lib/tipos";

// O caminho da vaga no modo Contratar (o menu, a Hoje e as páginas novas leem daqui):
//   agência ............ Clientes → Vagas → Candidatos → Para o cliente → Contratados
//   comércio e empresa . Vagas → Candidatos → Entrevistas → Contratados
// Uma leitura por requisição (React cache). Sem acesso a uma das tabelas, aquele número fica 0.

type Candidato = NonNullable<Awaited<ReturnType<typeof listarMeusCandidatos>>>[number];

/** O link de finalistas de uma vaga para o cliente. */
export type LinkDaVaga = { token: string; expira_em: string; aberto_em: string | null; aberturas: number };

/** Como está uma vaga no caminho (para a Hoje, Para o cliente e o topo da vaga). */
export type VagaNoCaminho = {
  anuncio: MeuAnuncio;
  /** o cliente da vaga (agência) */
  clienteId: string | null;
  candidatos: Candidato[];
  responder: number;
  entrevistas: number;
  contratados: Candidato[];
  /** quem deu match e ainda não está na lista de finalistas (pode ir para o cliente) */
  prontos: Candidato[];
  /** os finalistas da vaga (com a resposta do cliente, quando ele já respondeu) */
  finalistas: { perfil_id: string; decisao: string | null; decidido_em: string | null }[];
  link: LinkDaVaga | null;
};

export type Caminho = {
  agencia: boolean;
  clientes: number;
  /** os clientes ativos da agência, pelo nome */
  listaClientes: Cliente[];
  vagasNoAr: number;
  responder: number;
  entrevistas: number;
  /** quem pode ir para o cliente, em todas as vagas */
  prontos: number;
  /** finalistas com o cliente esperando resposta (link criado, sem decisão) */
  comCliente: number;
  /** respostas do cliente nos últimos 7 dias */
  respostasNovas: number;
  contratados: number;
  vagas: VagaNoCaminho[];
};

const SEMANA = 7 * 24 * 60 * 60 * 1000;

export const caminhoDaConta = cache(async (): Promise<Caminho> => {
  const [agora, perfil, anuncios, candidatos] = await Promise.all([
    agoraDaRequisicao(),
    obterMeuPerfil().catch(() => null),
    listarMeusAnuncios().catch(() => [] as MeuAnuncio[]),
    listarMeusCandidatos().catch(() => null),
  ]);
  const agencia = perfil?.tipo === "agencia";
  const vagas = anuncios.filter((a) => a.tipo === "vaga");
  const ids = vagas.map((a) => a.id);
  const supabase = await criarClienteServidor();
  const [clientes, doCliente, finalistas, links] = await Promise.all([
    agencia ? listarMeusClientes().catch(() => null) : Promise.resolve(null),
    agencia && perfil ? clientesDasVagas(perfil.id).catch(() => new Map<string, string>()) : Promise.resolve(new Map()),
    agencia && ids.length
      ? supabase
          .from("finalistas")
          .select("anuncio_id, perfil_id, decisao, decidido_em")
          .in("anuncio_id", ids)
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
    agencia && ids.length
      ? supabase
          .from("links_finalistas")
          .select("anuncio_id, token, expira_em, aberto_em, aberturas")
          .in("anuncio_id", ids)
          .then(({ data }) => data ?? [])
      : Promise.resolve([]),
  ]);

  const porVaga: VagaNoCaminho[] = vagas.map((a) => {
    const deles = (candidatos ?? []).filter((c) => c.anuncio_id === a.id);
    const fins = finalistas.filter((f) => f.anuncio_id === a.id);
    const naLista = new Set(fins.map((f) => f.perfil_id));
    const link = links.find((l) => l.anuncio_id === a.id);
    return {
      anuncio: a,
      clienteId: doCliente.get(a.id) ?? null,
      candidatos: deles,
      responder: deles.filter((c) => esperaResposta(c)).length,
      entrevistas: deles.filter((c) => c.etapa === "entrevista" && c.status === "match").length,
      contratados: deles.filter((c) => c.etapa === "contratado" && c.status === "match"),
      prontos: deles.filter(
        (c) =>
          c.status === "match" && c.etapa !== "contratado" && c.etapa !== "nao_seguiu" && !naLista.has(c.perfil_id),
      ),
      finalistas: fins.map(({ perfil_id, decisao, decidido_em }) => ({ perfil_id, decisao, decidido_em })),
      link: link
        ? { token: link.token, expira_em: link.expira_em, aberto_em: link.aberto_em, aberturas: link.aberturas }
        : null,
    };
  });

  const ativos = (clientes ?? []).filter((c) => !c.arquivado_em);
  const soma = (f: (v: VagaNoCaminho) => number) => porVaga.reduce((t, v) => t + f(v), 0);
  return {
    agencia,
    clientes: ativos.length,
    listaClientes: ativos,
    vagasNoAr: vagas.filter((a) => a.status === "ativo").length,
    responder: soma((v) => v.responder),
    entrevistas: soma((v) => v.entrevistas),
    prontos: soma((v) => (v.anuncio.status === "ativo" || v.anuncio.status === "pausado" ? v.prontos.length : 0)),
    comCliente: soma((v) => (v.link ? v.finalistas.filter((f) => !f.decisao).length : 0)),
    respostasNovas: soma(
      (v) => v.finalistas.filter((f) => f.decidido_em && agora - Date.parse(f.decidido_em) < SEMANA).length,
    ),
    contratados: soma((v) => v.contratados.length),
    vagas: porVaga,
  };
});
