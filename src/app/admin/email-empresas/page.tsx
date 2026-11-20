import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  ConfigEmailEmpresas,
  FilaDoPublico,
  PorVagaEmailEmpresas,
  TextoVagasEmailEmpresas,
} from "@/components/admin/email-empresas";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Numero, Secao, Situacao } from "@/components/admin/ui";
import { Aviso, Selo, Vazio, type VarianteSelo } from "@/components/ui/basicos";
import { PUBLICOS_EMAIL_EMPRESAS, type PublicoEmailEmpresas } from "@/lib/email-empresas";
import { formatarDataHora, formatarNumero, plural } from "@/lib/formato";
import { situacaoSmtpCampanha } from "@/lib/servidor/email-empresas";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "E-mail às empresas" };

// Admin › E-mail às empresas (18/11/2026; migração 20270722120000). Marcelo: levar as empresas a publicar no Publike
// "com um botao de sim", do marcelo@publike.org, "na base do publike e nas empresas que temos na base da receita, com
// esse controle máximo de quantidades". Liga e desliga, o limite por dia, o horário, o texto com a prévia, a fila por
// público, os números e quem disse sim. Sai pela caixa do Marcelo no Email Profissional da GoDaddy (Titan;
// CAMPANHA_SMTP_*), nunca pelo serviço dos avisos. Quando a caixa recusa, o motivo aparece no alto (20270727120000).
// No computador do dono e, no site no ar, para a equipe publike.org.

type Resumo = {
  config: {
    ligado: boolean;
    por_dia: number;
    hora_inicio: number;
    hora_fim: number;
    remetente_nome: string;
    remetente_email: string;
    assunto: string;
    texto: string;
  };
  numeros: {
    na_fila: number;
    enviados_hoje: number;
    enviados: number;
    abriram: number;
    sim: number;
    nao: number;
    falharam: number;
    // os endereços ruins (migração 20270812120000)
    invalidos?: number;
    voltaram?: number;
    enviados_7d?: number;
    voltaram_7d?: number;
  };
  por_publico: Partial<
    Record<PublicoEmailEmpresas, { na_fila: number; enviados: number; sim: number; nao: number; disponiveis: number }>
  >;
  sim: {
    id: number;
    publico: PublicoEmailEmpresas;
    conta_id: string | null;
    cnpj: string | null;
    nome: string;
    email: string;
    link_vagas: string | null;
    telefone: string | null;
    observacao: string | null;
    respondeu_em: string;
    // de quem anunciou vaga (migração 20270814120000)
    vaga?: string | null;
    onde?: string | null;
    link_vaga?: string | null;
  }[];
  ultimos: {
    id: number;
    publico: PublicoEmailEmpresas;
    conta_id: string | null;
    nome: string;
    situacao: string;
    erro: string | null;
    enviado_em: string | null;
    abriu_em: string | null;
    respondeu_em: string | null;
    quando: string;
  }[];
  /** `dias_ativos`: em quantos dias dos últimos 30 a conta entrou no Publike (migração 20270728120000) */
  proximos: { id: number; publico: PublicoEmailEmpresas; nome: string; dias_ativos?: number }[];
};

const SITUACAO: Record<string, { nome: string; variante: VarianteSelo }> = {
  enviando: { nome: "Saindo", variante: "neutro" },
  enviado: { nome: "Enviado", variante: "contorno" },
  falhou: { nome: "Falhou", variante: "perigo" },
  sim: { nome: "Disse sim", variante: "match" },
  nao: { nome: "Não quer", variante: "contorno" },
  invalido: { nome: "Endereço ruim", variante: "contorno" },
  voltou: { nome: "Voltou", variante: "perigo" },
};

/** Quem anunciou vaga em outro lugar (migração 20270814120000; sem ela, a seção não aparece). */
type Vagas = {
  assunto: string;
  texto: string;
  lista: {
    id: number;
    nome: string;
    email: string;
    vaga: string;
    onde: string | null;
    link_vaga: string | null;
    situacao: string;
    erro: string | null;
    criado_em: string;
    enviado_em: string | null;
  }[];
};

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : "—");

export default function EmailEmpresas() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/email-empresas"))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const [{ data, error }, { data: dParada }, { data: dCopia }, { data: dVagas }] = await Promise.all([
    c.rpc("admin_email_empresas"),
    // por que o envio parou (migração 20270727120000; sem ela, nada)
    c.rpc("admin_email_empresas_parada"),
    // a última cópia em "Enviados" (migração 20270729120000; sem ela, nada)
    c.rpc("admin_email_empresas_copia"),
    // quem anunciou vaga (migração 20270814120000; sem ela, nada)
    c.rpc("admin_email_empresas_vagas"),
  ]);
  const vagas = (dVagas ?? null) as Vagas | null;
  const parada = (dParada ?? null) as { motivo: string; em: string | null; ate: string | null; desligado: boolean } | null;
  const copia = (dCopia ?? null) as { erro: string | null; em: string } | null;
  const caixa = situacaoSmtpCampanha();
  const caixaPronta = Boolean(caixa.usuario && caixa.temSenha);

  if (error || !data) {
    return (
      <Aviso tipo="alerta" titulo="Rode a migração do e-mail às empresas">
        Falta a migração 20270722120000_email_as_empresas.sql neste banco.
      </Aviso>
    );
  }
  const r = data as unknown as Resumo;
  const n = r.numeros;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <h1 className="text-h2">E-mail às empresas</h1>
          <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
            O convite por e-mail para as empresas publicarem no Publike: um e-mail por empresa, com o botão “Sim, podem
            publicar”. Sai da caixa de {r.config.remetente_email}, poucos por dia, e quem pede para sair não recebe mais.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Situacao ok={r.config.ligado}>
            {r.config.ligado
              ? `Ligado: até ${plural(r.config.por_dia, "e-mail", "e-mails")} por dia, das ${r.config.hora_inicio}h às ${r.config.hora_fim}h, de segunda a sexta`
              : "Desligado: nada sai"}
          </Situacao>
          <Situacao ok={caixaPronta && !parada}>
            {!caixaPronta
              ? "Falta ligar a caixa: CAMPANHA_SMTP_USUARIO e CAMPANHA_SMTP_SENHA na Vercel"
              : parada
                ? `A caixa ${caixa.usuario} recusou o envio`
                : `A caixa ${caixa.usuario} está ligada (${caixa.servidor})`}
          </Situacao>
          <Situacao ok={n.na_fila > 0}>{plural(n.na_fila, "empresa na fila", "empresas na fila")}</Situacao>
          {copia && (
            <Situacao ok={!copia.erro}>
              {copia.erro
                ? "A cópia em Enviados não foi guardada"
                : `Cópia em Enviados de ${r.config.remetente_email}: a última em ${formatarDataHora(copia.em)}`}
            </Situacao>
          )}
        </div>
      </header>

      {parada && (
        <Aviso
          tipo="alerta"
          titulo={parada.desligado ? "O envio parou sozinho" : "O envio espera a caixa voltar"}
        >
          <p>
            {parada.motivo}
            {parada.em ? ` (${formatarDataHora(parada.em)})` : ""}
          </p>
          <p className="mt-1">
            {parada.ate
              ? `Tenta de novo em ${formatarDataHora(parada.ate)}. Nenhuma empresa ficou marcada como falha.`
              : "Nenhuma empresa ficou marcada como falha: elas continuam na fila. Conserte a caixa e marque “Mandar os e-mails da fila” de novo."}
          </p>
        </Aviso>
      )}

      {copia?.erro && (
        <Aviso tipo="alerta" titulo="A cópia em Enviados não foi guardada">
          <p>
            O e-mail saiu para a empresa; só a cópia na pasta de enviados de {r.config.remetente_email} falhou (
            {formatarDataHora(copia.em)}): {copia.erro}
          </p>
          <p className="mt-1">
            A cópia entra pelo IMAP da GoDaddy (imap.secureserver.net, porta 993), com o mesmo usuário e a mesma senha do
            envio. CAMPANHA_IMAP_SERVIDOR e CAMPANHA_IMAP_PORTA mudam, e CAMPANHA_IMAP_SERVIDOR = nao desliga a cópia.
          </p>
        </Aviso>
      )}

      {(!caixaPronta || parada?.desligado) && (
        <Aviso tipo="info" titulo="Para ligar a caixa">
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Na Vercel (Production), ponha CAMPANHA_SMTP_USUARIO = {r.config.remetente_email} e CAMPANHA_SMTP_SENHA = a
              senha dessa caixa (a mesma do webmail do Email Profissional da GoDaddy), e faça Redeploy.
            </li>
            <li>
              O servidor é o da GoDaddy para o Email Profissional (Titan): smtpout.secureserver.net, porta 465, com SSL.
              CAMPANHA_SMTP_SERVIDOR e CAMPANHA_SMTP_PORTA mudam, se precisar.
            </li>
            <li>Depois, marque “Mandar os e-mails da fila” e salve.</li>
          </ol>
        </Aviso>
      )}

      <Secao titulo="Os números">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Numero rotulo="Na fila" valor={n.na_fila} />
          <Numero rotulo="Enviados" valor={n.enviados} detalhe={`${formatarNumero(n.enviados_hoje)} hoje`} />
          <Numero rotulo="Abriram o link" valor={n.abriram} detalhe={`${pct(n.abriram, n.enviados)} dos enviados`} />
          <Numero rotulo="Disseram sim" valor={n.sim} detalhe={`${pct(n.sim, n.enviados)} dos enviados`} />
          <Numero rotulo="Não querem" valor={n.nao} detalhe={`${pct(n.nao, n.enviados)} dos enviados`} />
          <Numero rotulo="Falharam" valor={n.falharam} alerta={n.falharam > 0} />
        </div>
        {/* os endereços ruins (20/11/2026): o que não saiu e o que voltou como "não existe" */}
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-6">
          <Numero
            rotulo="Endereços ruins"
            valor={n.invalidos ?? 0}
            detalhe="não saíram: de mentira ou domínio sem e-mail"
          />
          <Numero
            rotulo="Voltaram"
            valor={n.voltaram ?? 0}
            detalhe={`${pct(n.voltaram_7d ?? 0, n.enviados_7d ?? 0)} dos enviados em 7 dias`}
            alerta={(n.enviados_7d ?? 0) >= 20 && (n.voltaram_7d ?? 0) / Math.max(n.enviados_7d ?? 1, 1) > 0.05}
          />
        </div>
        {(n.enviados_7d ?? 0) >= 20 && (n.voltaram_7d ?? 0) / Math.max(n.enviados_7d ?? 1, 1) > 0.05 && (
          <p className="mt-3 text-body-sm text-danger">
            Mais de 5% dos e-mails da semana voltaram. Acima disso, o Gmail e o Outlook passam a desconfiar da caixa:
            vale diminuir o número por dia ou parar e revisar a base antes de seguir.
          </p>
        )}
      </Secao>

      <Secao
        titulo="Quem disse sim"
        descricao="A equipe recebe um e-mail a cada sim. Publique as vagas pela conta da empresa (Admin › Usuários) ou crie a conta e importe da Gupy, e responda o e-mail avisando."
      >
        {r.sim.length === 0 ? (
          <Vazio icone={MailCheck} titulo="Ninguém ainda">
            Quando uma empresa tocar em “Sim, podem publicar”, ela aparece aqui.
          </Vazio>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {r.sim.map((s) => (
              <li key={s.id} className="flex flex-col gap-0.5 py-3 text-body-sm">
                <span>
                  {s.conta_id ? (
                    <Link href={`/admin/usuarios/${s.conta_id}`} className="text-label text-ink underline-offset-2 hover:underline">
                      {s.nome}
                    </Link>
                  ) : (
                    <span className="text-label text-ink">{s.nome}</span>
                  )}
                  <span className="text-ink-muted"> · {PUBLICOS_EMAIL_EMPRESAS[s.publico]?.nome ?? s.publico}</span>
                </span>
                <span className="break-all text-ink-muted">{s.email}</span>
                {s.vaga && (
                  <span>
                    Vaga: {s.vaga}
                    {s.onde ? ` (vista ${s.onde})` : ""}
                    {s.link_vaga && (
                      <>
                        {" · "}
                        <a href={s.link_vaga} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                          o anúncio
                        </a>
                      </>
                    )}
                  </span>
                )}
                {s.link_vagas && (
                  <span className="break-all">
                    Vagas:{" "}
                    <a href={s.link_vagas} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                      {s.link_vagas}
                    </a>
                  </span>
                )}
                {s.telefone && <span>Telefone: {s.telefone}</span>}
                {s.observacao && <span className="text-ink-muted">“{s.observacao}”</span>}
                <span className="text-ink-muted">Disse sim em {formatarDataHora(s.respondeu_em)}</span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao
        titulo="A fila"
        descricao="Escolha quantos de cada público entram na fila. Cada endereço recebe uma vez só; quem pediu para sair, nunca mais. Sai primeiro quem é do Publike, depois as agências e as que abriram perto; entre as contas do Publike, quem entrou no site em mais dias dos últimos 30."
      >
        <ul className="flex flex-col divide-y divide-line">
          {(Object.keys(PUBLICOS_EMAIL_EMPRESAS) as PublicoEmailEmpresas[])
            .filter((p) => p !== "vagas")
            .map((p) => {
            const x = r.por_publico[p] ?? { na_fila: 0, enviados: 0, sim: 0, nao: 0, disponiveis: 0 };
            return (
              <li key={p} className="grid gap-x-6 gap-y-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <span className="flex min-w-0 max-w-xl flex-col gap-0.5 text-body-sm">
                  <span className="text-label">{PUBLICOS_EMAIL_EMPRESAS[p].nome}</span>
                  <span className="text-ink-muted">{PUBLICOS_EMAIL_EMPRESAS[p].ajuda}</span>
                  <span className="tabular-nums">
                    {formatarNumero(x.disponiveis)} para pôr · {formatarNumero(x.na_fila)} na fila ·{" "}
                    {formatarNumero(x.enviados)} enviados · {formatarNumero(x.sim)} sim · {formatarNumero(x.nao)} não
                  </span>
                </span>
                <FilaDoPublico publico={p} disponiveis={x.disponiveis} naFila={x.na_fila} />
              </li>
            );
          })}
        </ul>
        {r.proximos.length > 0 && (
          <p className="text-body-sm text-ink-muted">
            Os próximos:{" "}
            {r.proximos
              .map((x) => (x.dias_ativos ? `${x.nome} (${plural(x.dias_ativos, "dia", "dias")} no site)` : x.nome))
              .join(", ")}
            {n.na_fila > r.proximos.length ? "…" : "."}
          </p>
        )}
      </Secao>

      {vagas && (
        <Secao
          titulo="Quem anunciou vaga"
          descricao="Empresas que anunciaram vaga em outro lugar, uma a uma. O e-mail cita a vaga e oferece publicar de graça, pelo WhatsApp ou pelo site. Só o endereço da empresa (o pessoal fica de fora), cada endereço uma vez só, e sai antes dos outros públicos, dentro do limite do dia. A vaga posta há mais de 30 dias sai da fila sozinha."
        >
          <PorVagaEmailEmpresas />
          {vagas.lista.length > 0 && (
            <ul className="flex flex-col divide-y divide-line">
              {vagas.lista.map((v) => {
                const st =
                  v.situacao === "na_fila"
                    ? { nome: "Na fila", variante: "neutro" as const }
                    : (SITUACAO[v.situacao] ?? { nome: v.situacao, variante: "contorno" as const });
                return (
                  <li key={v.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-body-sm">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-label">{v.nome}</span>
                      <span className="text-ink-muted">
                        {v.vaga}
                        {v.onde ? `, vista ${v.onde}` : ""}
                      </span>
                      <span className="break-all text-ink-muted">{v.email}</span>
                      {v.erro && <span className="text-danger">{v.erro}</span>}
                    </span>
                    <span className="flex flex-col items-end gap-1 text-right">
                      <Selo variante={st.variante}>{st.nome}</Selo>
                      <span className="text-ink-muted tabular-nums">
                        {formatarDataHora(v.enviado_em ?? v.criado_em)}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <details className="rounded-md border border-line p-4">
            <summary className="cursor-pointer text-label">O texto deste e-mail</summary>
            <div className="mt-4">
              <TextoVagasEmailEmpresas
                inicial={{ assunto: vagas.assunto, texto: vagas.texto }}
                remetenteNome={r.config.remetente_nome}
              />
            </div>
          </details>
        </Secao>
      )}

      <Secao titulo="O e-mail" descricao="Nasce desligado: confira a prévia, salve o texto e ligue quando quiser começar.">
        <ConfigEmailEmpresas inicial={r.config} caixaPronta={caixaPronta} />
      </Secao>

      <Secao titulo="Os últimos" descricao="Os que já saíram, do mais novo para o mais antigo.">
        {r.ultimos.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhum e-mail saiu ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {r.ultimos.map((u) => {
              const st = SITUACAO[u.situacao] ?? { nome: u.situacao, variante: "contorno" as const };
              return (
                <li key={u.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-body-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-label">{u.nome}</span>
                    <span className="text-ink-muted">{PUBLICOS_EMAIL_EMPRESAS[u.publico]?.nome ?? u.publico}</span>
                    {u.erro && <span className="text-danger">{u.erro}</span>}
                  </span>
                  <span className="flex flex-col items-end gap-1 text-right">
                    <Selo variante={st.variante}>{st.nome}</Selo>
                    <span className="text-ink-muted tabular-nums">{formatarDataHora(u.quando)}</span>
                    {u.abriu_em && u.situacao === "enviado" && <span className="text-ink-muted">abriu o link</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Secao>
    </div>
  );
}
