import { Heart, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Filtros, linkCom, Numero, Secao } from "@/components/admin/ui";
import { Aviso, Vazio } from "@/components/ui/basicos";
import {
  curtidasDaModeracao,
  curtidasRecentes,
  inicioDeHoje,
  type CurtidaAdmin,
} from "@/lib/admin/dados";
import {
  ateQuando,
  formatarNumero,
  plural,
  primeiro,
  rotuloConta,
  semPrazo,
  tempoRelativo,
} from "@/lib/formato";
import { comoResponde } from "@/lib/resposta";
import { ehModerador } from "@/lib/dados";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Curtidas" };

// Admin › Curtidas (05/11/2026): quem curtiu o quê, de quem, e como ficou (esperando o aceite, aceita e falta o
// currículo, deu match, não foi dessa vez, match desfeito). Só no admin, no computador do dono. Cada nome leva à
// ficha da conta ou do anúncio no admin. No site no ar, a moderação (com login) vê a mesma lista pela função
// moderacao_curtidas (migração 20270304120000); ali os nomes levam ao perfil público.

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
  direto: { humano: false, texto: "o anúncio tem contato direto: aceita na hora, sem ninguém responder" },
  automacao: { humano: false, texto: "uma automação da vaga respondeu" },
  regra: { humano: false, texto: "uma regra da empresa respondeu" },
  publike: { humano: false, texto: "o Publike fechou depois de 48 h sem resposta" },
};

/** O botão tocado: "no WhatsApp", "pelo telefone", "por e-mail". */
const CANAL: Record<string, string> = { whatsapp: "no WhatsApp", telefone: "pelo telefone", email: "por e-mail" };

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
const HORA = 60 * 60 * 1000;

/** "12 min", "3 h", "2 dias": o tempo entre dois passos da linha do tempo. */
function duracao(ms: number) {
  if (ms < HORA) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < DIA) return `${Math.round(ms / HORA)} h`;
  const dias = Math.round(ms / DIA);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

/** "6 nov., 14:20", no horário de Goiânia. */
function quandoCurto(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

const entre = (de: string, ate: string) => new Date(ate).getTime() - new Date(de).getTime();

/** Como o anúncio saiu do ar (ou que ainda está no ar), para o fim da linha do tempo. */
function fimDoAnuncio(a: NonNullable<CurtidaAdmin["anuncio"]>, agora: number): { texto: string; em: string | null; fechou: boolean } {
  const nome = a.tipo === "servico" ? "Anúncio" : "Vaga";
  if (a.preenchida_em) return { texto: `${nome} preenchida`, em: a.preenchida_em, fechou: true };
  if (a.status === "encerrado") return { texto: `${nome} encerrada`, em: a.atualizado_em, fechou: true };
  if (a.status === "expirado" || (!semPrazo(a.expira_em) && new Date(a.expira_em).getTime() < agora))
    return { texto: `${nome} saiu do ar no prazo`, em: a.expira_em, fechou: true };
  if (a.status === "removido") return { texto: `${nome} removida`, em: a.atualizado_em, fechou: true };
  if (a.status === "pausado") return { texto: `${nome} pausada`, em: a.atualizado_em, fechou: true };
  if (a.status === "em_analise") return { texto: `${nome} em análise`, em: null, fechou: false };
  return { texto: `${nome} no ar, ${ateQuando(a.expira_em)}`, em: null, fechou: false };
}

/** A mediana de uma lista de números (vazia: null). */
function mediana(v: number[]) {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

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
  // o admin (no computador do dono) ou a moderação, com login, no site no ar
  const admin = await ehAdminLocal();
  if (!admin && !(await ehModerador())) notFound();
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
  const lidas = admin
    ? await curtidasRecentes(criarClienteAdmin(), desde)
    : await curtidasDaModeracao(await criarClienteServidor(), desde);
  if (!lidas) {
    return (
      <Aviso tipo="alerta" titulo="Falta a migração das curtidas para a moderação">
        Rode no Supabase a migração 20270304120000_curtidas_para_moderador.sql para ver as curtidas no site no ar.
      </Aviso>
    );
  }
  const todas = lidas;
  const lista =
    situacao === "todas" ? todas : todas.filter((x) => x.situacao === situacao);
  const conta = (s: CurtidaAdmin["situacao"]) =>
    todas.filter((x) => x.situacao === s).length;
  const respondidas = todas.filter((x) => x.situacao !== "pendente").length;
  // os matches em que alguém tocou no WhatsApp, no telefone ou no e-mail
  // (o "agora não" da pessoa não é contato)
  const chamou = (t: CurtidaAdmin["contatos"]["pessoa"]) => Boolean(t && t.canal !== "descartou");
  const comContato = todas.filter(
    (x) => x.situacao === "match" && (chamou(x.contatos.empresa) || chamou(x.contatos.pessoa)),
  ).length;
  const humanas = todas.filter((x) => x.respondida_por && POR[x.respondida_por]?.humano).length;
  const automaticas = todas.filter((x) => x.respondida_por && POR[x.respondida_por] && !POR[x.respondida_por].humano).length;
  // os números do alto: o tempo até a resposta e os anúncios que já saíram do ar
  const tempoAteResponder = mediana(
    todas.filter((x) => x.situacao !== "pendente" && x.respondida_em).map((x) => entre(x.quando, x.respondida_em as string)),
  );
  const anunciosCurtidos = new Map(todas.flatMap((x) => (x.anuncio ? [[x.anuncio.id, x.anuncio] as const] : [])));
  const fechados = [...anunciosCurtidos.values()].filter((a) => fimDoAnuncio(a, agora).fechou).length;
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Numero rotulo="Curtidas" valor={todas.length} icone={Heart} detalhe={`${conta("pendente")} esperando o aceite`} />
            <Numero
              rotulo="Respondidas"
              valor={respondidas}
              detalhe={`${Math.round((100 * respondidas) / todas.length)}%${
                tempoAteResponder !== null ? `, em geral em ${duracao(tempoAteResponder)}` : ""
              }`}
            />
            <Numero rotulo="Matches" valor={conta("match")} />
            <Numero rotulo="Com contato" valor={comContato} detalhe="WhatsApp, telefone ou e-mail tocado" icone={MessageCircle} />
            <Numero
              rotulo="Saíram do ar"
              valor={fechados}
              detalhe={`de ${plural(anunciosCurtidos.size, "anúncio curtido", "anúncios curtidos")}`}
            />
          </div>
        )}
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
            {conta("match") > 0 &&
              ` Em ${formatarNumero(comContato)} ${comContato === 1 ? "match" : "dos matches"}, alguém tocou no WhatsApp, no telefone ou no e-mail.`}
          </p>
        )}
        {lista.length === 0 ? (
          <Vazio icone={Heart} titulo="Nenhuma curtida aqui">
            Troque o período ou o filtro.
          </Vazio>
        ) : (
          <Tabela linhas={lista} agora={agora} admin={admin} />
        )}
      </Secao>
    </div>
  );
}

function Conta({
  c,
  agora,
  admin,
}: {
  c: { id: string; nome: string; tipo: string; acesso: string | null } | null;
  agora: number;
  /** a ficha da conta só existe no admin; na moderação, o perfil público */
  admin: boolean;
}) {
  if (!c) return <span className="text-ink-muted">Conta excluída</span>;
  return (
    <span className="flex min-w-0 flex-col">
      <Link
        href={admin ? `/admin/usuarios/${c.id}` : `/perfil/${c.id}`}
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

function Tabela({ linhas, agora, admin }: { linhas: CurtidaAdmin[]; agora: number; admin: boolean }) {
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
              Linha do tempo
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
                <Conta c={m.curtiu} agora={agora} admin={admin} />
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
                      {m.anuncio.tipo === "servico" ? "Serviço" : "Vaga"} ·{" "}
                      {plural(m.anuncio.curtidas, "curtida", "curtidas")} no total
                    </span>
                  </span>
                ) : (
                  <span className="text-ink-muted">Anúncio excluído</span>
                )}
              </td>
              <td className="py-2 pr-3">
                <Conta c={m.publicou} agora={agora} admin={admin} />
                {/* o mesmo indicador do cartão da vaga */}
                {m.publicou?.resposta && (
                  <span
                    className={`mt-0.5 block text-caption ${
                      comoResponde(m.publicou.resposta, true).bom ? "text-cerrado-text" : "text-ink-muted"
                    }`}
                  >
                    {comoResponde(m.publicou.resposta, true).texto}
                  </span>
                )}
              </td>
              <td className="py-2">
                <LinhaDoTempo m={m} agora={agora} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Um passo da linha do tempo: a bolinha, o que aconteceu, quando e quanto depois do passo de antes. */
type Passo = { cor: string; titulo: string; detalhe?: string | null; em?: string | null; depois?: string | null; aberto?: boolean };

/**
 * A linha do tempo de uma curtida: curtiu → respondida (humano ou automático) → o contato → o fim do anúncio
 * (preenchida, encerrada, saiu do ar no prazo, pausada, removida) ou "no ar". Com o tempo entre os passos.
 */
function LinhaDoTempo({ m, agora }: { m: CurtidaAdmin; agora: number }) {
  const passos: Passo[] = [{ cor: "bg-like", titulo: "Curtiu", em: m.quando }];
  let antes = m.quando;

  if (m.situacao === "pendente" || !m.respondida_em) {
    passos.push({
      cor: COR.pendente,
      titulo: SITUACOES[m.situacao].nome,
      detalhe: `há ${duracao(Math.max(0, agora - new Date(m.quando).getTime()))}, sem resposta`,
      aberto: true,
    });
  } else {
    const por = m.respondida_por ? POR[m.respondida_por] : null;
    passos.push({
      cor: COR[m.situacao],
      titulo: `${SITUACOES[m.situacao].nome}${por ? ` · ${por.humano ? "humano" : "automático"}` : ""}`,
      detalhe: por?.texto ?? null,
      em: m.respondida_em,
      depois: duracao(Math.max(0, entre(antes, m.respondida_em))),
    });
    antes = m.respondida_em;
  }

  // os toques nos botões de contato, na ordem em que aconteceram
  const toques = (["empresa", "pessoa"] as const)
    .flatMap((lado) => (m.contatos[lado] ? [{ lado, t: m.contatos[lado] }] : []))
    .sort((a, b) => a.t.em.localeCompare(b.t.em));
  for (const { lado, t } of toques) {
    passos.push({
      cor: "bg-cerrado",
      titulo:
        t.canal === "descartou"
          ? "A pessoa disse “agora não” ao WhatsApp"
          : `${lado === "empresa" ? "Quem publicou chamou" : "A pessoa chamou"} ${CANAL[t.canal]}`,
      detalhe: t.canal === "descartou" ? "o chat abriu com as perguntas" : null,
      em: t.em,
      depois: duracao(Math.max(0, entre(antes, t.em))),
    });
    antes = t.em;
  }

  if (m.anuncio) {
    const fim = fimDoAnuncio(m.anuncio, agora);
    passos.push({
      cor: fim.fechou ? "bg-ink-muted" : "bg-line-strong",
      titulo: fim.texto,
      em: fim.em,
      // quanto tempo a vaga ficou no ar depois da curtida
      depois: fim.em ? `${duracao(Math.max(0, entre(m.quando, fim.em)))} depois da curtida` : null,
      aberto: !fim.fechou,
    });
  }

  return (
    <ol className="flex w-[15rem] flex-col xl:w-[18rem]">
      {passos.map((p, i) => (
        <li key={i} className="relative flex gap-2 pb-2 last:pb-0">
          {/* o fio entre as bolinhas (tracejado quando o passo ainda está aberto) */}
          {i < passos.length - 1 && (
            <span aria-hidden className={`absolute top-3 bottom-0 left-[4px] border-l ${passos[i + 1].aberto ? "border-dashed" : ""} border-line-strong`} />
          )}
          <span
            aria-hidden
            className={`relative mt-1.5 size-2.5 shrink-0 rounded-pill ${p.aberto ? "border border-line-strong bg-surface-100" : p.cor}`}
          />
          <span className="flex min-w-0 flex-col break-words">
            <span className="font-semibold">{p.titulo}</span>
            <span className="text-caption text-ink-muted">
              {p.em && <span title={new Date(p.em).toLocaleString("pt-BR")}>{quandoCurto(p.em)}</span>}
              {p.em && p.depois && " · "}
              {p.depois && (p.depois.includes("depois") ? p.depois : `${p.depois} depois`)}
            </span>
            {p.detalhe && <span className="text-caption text-ink-muted">{p.detalhe}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
