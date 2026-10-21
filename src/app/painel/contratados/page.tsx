import { BadgeCheck, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { dataBR, hojeEmBrasilia, resumoDasColocacoes, situacaoDaColocacao } from "@/lib/colocacoes";
import { MODO_DEMO } from "@/lib/config";
import { formatarMoeda, plural } from "@/lib/formato";
import { caminhoDaConta } from "@/lib/servidor/caminho";
import { colocacoesDasVagas } from "@/lib/servidor/colocacoes";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Contratados" };

// Contratados: quem foi contratado em todas as vagas, do mais recente ao mais antigo. Na
// agência, com a colocação de cada um (taxa, garantia e se já recebeu), que antes só
// aparecia na ficha de cada cliente.

export default function Contratados() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/contratados");
  const [caminho, agora] = await Promise.all([caminhoDaConta(), agoraDaRequisicao()]);
  const colocacoes = caminho.agencia ? await colocacoesDasVagas() : new Map();
  const hoje = hojeEmBrasilia(agora);
  const nomeDoCliente = new Map(caminho.listaClientes.map((c) => [c.id, c.nome]));
  const lista = caminho.vagas
    .flatMap((v) =>
      v.contratados.map((c) => ({
        c,
        vaga: v.anuncio,
        cliente: v.clienteId ? (nomeDoCliente.get(v.clienteId) ?? null) : null,
        colocacao: colocacoes.get(`${v.anuncio.id}:${c.perfil_id}`) ?? null,
      })),
    )
    .sort((a, b) => (b.c.etapa_em ?? b.c.curtido_em).localeCompare(a.c.etapa_em ?? a.c.curtido_em));
  const resumo = caminho.agencia ? resumoDasColocacoes([...colocacoes.values()], hoje) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="max-w-2xl">
        <h2 className="text-h2">Contratados</h2>
        <p className="mt-1 text-body text-ink-muted">
          {caminho.agencia
            ? "Quem você colocou nos clientes, com a taxa, a garantia e o que falta receber."
            : "Quem você contratou pelo Publike, de todas as vagas."}
        </p>
      </div>
      {resumo && resumo.total > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Numero nome="Colocações" valor={String(resumo.total)} />
          <Numero nome="Em garantia" valor={String(resumo.emGarantia)} />
          <Numero nome="Reposições" valor={String(resumo.reposicoes)} destaque={resumo.reposicoes > 0} />
          <Numero nome="A receber" valor={formatarMoeda(resumo.aReceber)} destaque={resumo.aReceber > 0} />
        </dl>
      )}
      {lista.length === 0 ? (
        <Vazio
          icone={BadgeCheck}
          titulo="Ninguém contratado ainda"
          acao={<BotaoLink href="/painel/caixa">Ver os candidatos</BotaoLink>}
        >
          Quando alguém for contratado, leve a pessoa para Contratado no quadro da vaga: ela aparece aqui
          {caminho.agencia ? ", com a taxa e a garantia para o cliente" : ""}.
        </Vazio>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200 shadow-card">
          {lista.map(({ c, vaga, cliente, colocacao }) => {
            const s = colocacao ? situacaoDaColocacao(colocacao, hoje) : null;
            return (
              <li key={`${vaga.id}:${c.perfil_id}`} data-contratado={c.nome}>
                <Link
                  href={`/painel/anuncio/${vaga.id}/quadro?candidato=${c.perfil_id}`}
                  className="group flex flex-wrap items-center gap-x-3 gap-y-2 p-4 sm:flex-nowrap sm:p-5"
                >
                  <Avatar nome={c.nome} tamanho={40} />
                  <span className="min-w-0 flex-1 basis-48">
                    <span className="block text-label group-hover:underline">{c.nome}</span>
                    <span className="block text-body-sm text-ink-muted">
                      {vaga.titulo}
                      {cliente ? ` · ${cliente}` : ""}
                      {colocacao ? ` · desde ${dataBR(colocacao.inicio)}` : ""}
                    </span>
                    {s && (
                      <span
                        className={`mt-0.5 block text-body-sm ${s.tipo === "reposicao" ? "text-terra-text" : "text-ink-muted"}`}
                      >
                        {s.texto}
                      </span>
                    )}
                  </span>
                  {caminho.agencia &&
                    (colocacao ? (
                      colocacao.taxa ? (
                        <Selo variante={colocacao.paga ? "match" : "aviso"}>
                          {formatarMoeda(colocacao.taxa)} · {colocacao.paga ? "recebida" : "a receber"}
                        </Selo>
                      ) : null
                    ) : (
                      <Selo variante="contorno">Sem colocação</Selo>
                    ))}
                  <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {lista.length > 0 && (
        <p className="text-body-sm text-ink-muted">
          {plural(lista.length, "pessoa contratada", "pessoas contratadas")}.
          {caminho.agencia && " A taxa e a garantia de cada uma ficam no cartão dela, no quadro da vaga."}
        </p>
      )}
    </div>
  );
}

function Numero({ nome, valor, destaque = false }: { nome: string; valor: string; destaque?: boolean }) {
  return (
    <div
      className={`flex flex-col-reverse rounded-lg border p-4 ${destaque ? "border-transparent bg-terra-soft text-terra-text" : "border-line bg-surface-200"}`}
    >
      <dt className={`text-body-sm ${destaque ? "" : "text-ink-muted"}`}>{nome}</dt>
      <dd className="font-display text-h2 leading-none tabular-nums">{valor}</dd>
    </div>
  );
}
