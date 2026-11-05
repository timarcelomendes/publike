import { Heart } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Filtros, linkCom, Secao } from "@/components/admin/ui";
import { Vazio } from "@/components/ui/basicos";
import {
  curtidasRecentes,
  inicioDeHoje,
  type CurtidaAdmin,
} from "@/lib/admin/dados";
import {
  formatarNumero,
  plural,
  primeiro,
  rotuloConta,
  tempoRelativo,
} from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Curtidas" };

// Admin › Curtidas (05/11/2026): quem curtiu o quê, de quem, e como ficou (esperando o aceite, aceita e falta o
// currículo, deu match, não foi dessa vez, match desfeito). Só no admin, no computador do dono. Cada nome leva à
// ficha da conta ou do anúncio no admin.

const PERIODOS = [
  { valor: "hoje", nome: "Hoje" },
  { valor: "7", nome: "7 dias" },
  { valor: "30", nome: "30 dias" },
  { valor: "tudo", nome: "Tudo" },
];

const SITUACOES: Record<
  CurtidaAdmin["situacao"],
  { nome: string }
> = {
  pendente: { nome: "Esperando o aceite" },
  aceita: { nome: "Aceita, sem currículo" },
  match: { nome: "Deu match" },
  dispensada: { nome: "Não foi dessa vez" },
  desfeito: { nome: "Match desfeito" },
};
/** Quem respondeu (migração 20270215120000; as antigas são uma estimativa pelo que ficou registrado). Humano: alguém
 * clicou; automático: ninguém clicou (a IA não responde curtidas). */
const POR: Record<string, { humano: boolean; texto: string }> = {
  empresa: { humano: true, texto: "a empresa (ou a equipe dela) respondeu" },
  pessoa: { humano: true, texto: "quem publicou respondeu" },
  direto: { humano: false, texto: "o anúncio tem contato direto: virou match na hora, ninguém respondeu" },
  automacao: { humano: false, texto: "uma automação da vaga respondeu" },
  regra: { humano: false, texto: "uma regra da empresa respondeu" },
  publike: { humano: false, texto: "o Publike fechou depois de 48 h sem resposta" },
};

const COR: Record<CurtidaAdmin["situacao"], string> = {
  pendente: "bg-like",
  aceita: "bg-terra",
  match: "bg-cerrado",
  dispensada: "bg-line-strong",
  desfeito: "bg-line-strong",
};
const FILTROS = [
  { valor: "todas", nome: "Todas" },
  ...(Object.keys(SITUACOES) as CurtidaAdmin["situacao"][]).map((s) => ({
    valor: s,
    nome: SITUACOES[s].nome,
  })),
];

const DIA = 24 * 60 * 60 * 1000;

export default function Curtidas({
  searchParams,
}: PageProps<"/admin/curtidas">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  searchParams,
}: {
  searchParams: PageProps<"/admin/curtidas">["searchParams"];
}) {
  const c = await exigirAdminLocal();
  const sp = await searchParams;
  const pedido = primeiro(sp.periodo) ?? "7";
  const periodo = PERIODOS.some((p) => p.valor === pedido) ? pedido : "7";
  const pedidaSituacao = primeiro(sp.situacao) ?? "todas";
  const situacao = FILTROS.some((f) => f.valor === pedidaSituacao)
    ? pedidaSituacao
    : "todas";
  const agora = await agoraDaRequisicao();
  const desde =
    periodo === "tudo"
      ? null
      : periodo === "hoje"
        ? inicioDeHoje(agora)
        : new Date(agora - Number(periodo) * DIA).toISOString();
  const todas = await curtidasRecentes(c, desde);
  const lista =
    situacao === "todas" ? todas : todas.filter((x) => x.situacao === situacao);
  const conta = (s: CurtidaAdmin["situacao"]) =>
    todas.filter((x) => x.situacao === s).length;
  const respondidas = todas.filter((x) => x.situacao !== "pendente").length;
  const humanas = todas.filter((x) => x.respondida_por && POR[x.respondida_por]?.humano).length;
  const automaticas = todas.filter((x) => x.respondida_por && POR[x.respondida_por] && !POR[x.respondida_por].humano).length;
  const noPeriodo =
    periodo === "tudo"
      ? ""
      : periodo === "hoje"
        ? " hoje"
        : ` em ${periodo} dias`;

  return (
    <div className="flex flex-col gap-6">
      <Secao
        titulo="Curtidas"
        descricao="Quem curtiu, o anúncio, quem publicou e como ficou, da mais nova para a mais antiga. Curtir uma vaga é se candidatar; o match é quando quem publicou aceita (ou na hora, no contato direto)."
      >
        <div className="flex flex-col gap-3">
          <Filtros
            rotulo="Período"
            opcoes={PERIODOS}
            atual={periodo}
            link={(v) =>
              linkCom(
                "/admin/curtidas",
                {},
                {
                  periodo: v === "7" ? null : v,
                  situacao: situacao === "todas" ? null : situacao,
                },
              )
            }
          />
          <Filtros
            rotulo="Como ficou"
            opcoes={FILTROS.map((f) => ({
              ...f,
              nome:
                f.valor === "todas"
                  ? `Todas ${todas.length}`
                  : `${f.nome} ${conta(f.valor as CurtidaAdmin["situacao"])}`,
            }))}
            atual={situacao}
            link={(v) =>
              linkCom(
                "/admin/curtidas",
                {},
                {
                  periodo: periodo === "7" ? null : periodo,
                  situacao: v === "todas" ? null : v,
                },
              )
            }
          />
        </div>
        {todas.length > 0 && (
          <p className="text-body-sm text-ink-muted">
            {plural(todas.length, "curtida", "curtidas")}
            {noPeriodo}
            {todas.length >= 500 ? " (as 500 mais novas)" : ""}:{" "}
            {formatarNumero(respondidas)} respondidas (
            {Math.round((100 * respondidas) / todas.length)}%: {formatarNumero(humanas)} por uma pessoa e{" "}
            {formatarNumero(automaticas)} automáticas),{" "}
            {plural(conta("match"), "match", "matches")} e{" "}
            {formatarNumero(conta("pendente"))} esperando o aceite.
          </p>
        )}
        {lista.length === 0 ? (
          <Vazio icone={Heart} titulo="Nenhuma curtida aqui">
            Troque o período ou o filtro.
          </Vazio>
        ) : (
          <Tabela linhas={lista} agora={agora} />
        )}
      </Secao>
    </div>
  );
}

function Conta({
  c,
  agora,
}: {
  c: { id: string; nome: string; tipo: string; acesso: string | null } | null;
  agora: number;
}) {
  if (!c) return <span className="text-ink-muted">Conta excluída</span>;
  return (
    <span className="flex min-w-0 flex-col">
      <Link
        href={`/admin/usuarios/${c.id}`}
        className="font-medium underline-offset-2 hover:underline"
      >
        {c.nome}
      </Link>
      <span className="text-caption text-ink-muted">{rotuloConta(c.tipo)}</span>
      {/* o último acesso: o login ou a última página aberta */}
      <span
        className="text-caption text-ink-muted"
        title={c.acesso ? new Date(c.acesso).toLocaleString("pt-BR") : undefined}
      >
        {c.acesso ? `entrou ${tempoRelativo(c.acesso, agora)}` : "nunca entrou"}
      </span>
    </span>
  );
}

function Tabela({ linhas, agora }: { linhas: CurtidaAdmin[]; agora: number }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[44rem] text-left text-body-sm">
        <thead className="text-label text-ink-muted">
          <tr className="border-b border-line">
            <th scope="col" className="py-2 pr-3 font-medium">
              Quando
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Quem curtiu
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Anúncio
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Quem publicou
            </th>
            <th scope="col" className="py-2 font-medium">
              Como ficou
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {linhas.map((m, i) => (
            <tr
              key={`${m.anuncio?.id ?? "x"}-${m.curtiu?.id ?? i}`}
              className="align-top"
            >
              <td
                className="py-2 pr-3 whitespace-nowrap text-ink-muted"
                title={new Date(m.quando).toLocaleString("pt-BR")}
              >
                {tempoRelativo(m.quando, agora)}
              </td>
              <td className="py-2 pr-3">
                <Conta c={m.curtiu} agora={agora} />
              </td>
              <td className="py-2 pr-3">
                {m.anuncio ? (
                  <span className="flex min-w-0 flex-col">
                    <Link
                      href={`/admin/anuncios/${m.anuncio.id}`}
                      className="font-medium underline-offset-2 hover:underline"
                    >
                      {m.anuncio.titulo}
                    </Link>
                    <span className="text-caption text-ink-muted">
                      {m.anuncio.tipo === "servico" ? "Serviço" : "Vaga"}
                    </span>
                  </span>
                ) : (
                  <span className="text-ink-muted">Anúncio excluído</span>
                )}
              </td>
              <td className="py-2 pr-3">
                <Conta c={m.publicou} agora={agora} />
              </td>
              <td className="py-2">
                <span className="flex min-w-[9rem] flex-col items-start gap-1">
                  {/* a bolinha na cor da situação e o nome (quebra a linha; o selo não cabia na coluna) */}
                  <span className="font-semibold">
                    <span aria-hidden className={`mr-1.5 inline-block size-2 rounded-pill align-middle ${COR[m.situacao]}`} />
                    {SITUACOES[m.situacao].nome}
                  </span>
                  {m.situacao !== "pendente" && m.respondida_em && (
                    <span className="flex flex-col gap-0.5 text-caption text-ink-muted">
                      {m.respondida_por && POR[m.respondida_por] && (
                        // humano ou automático em destaque; o porquê embaixo
                        <span className="font-semibold text-ink">
                          {POR[m.respondida_por].humano ? "Humano" : "Automático"}
                        </span>
                      )}
                      <span title={new Date(m.respondida_em).toLocaleString("pt-BR")}>
                        {m.respondida_por && POR[m.respondida_por]
                          ? `${POR[m.respondida_por].texto}, ${tempoRelativo(m.respondida_em, agora)}`
                          : `respondida ${tempoRelativo(m.respondida_em, agora)}`}
                      </span>
                    </span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
