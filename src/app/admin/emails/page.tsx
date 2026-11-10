import { CalendarPlus, FileText, Gauge, ListChecks, MailCheck, MailWarning, Send, Settings, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  BoasVindasPendentes,
  BotoesFila,
  ConvitesPorEmail,
  FormConfigEmails,
  FormCreditosEmail,
  FormEmailTeste,
  FormLogoEmails,
  LigarEmailsDoSite,
  MandarDeNovo,
  TextosDosEmails,
} from "@/components/admin/emails";
import { LigarCombinam } from "@/components/admin/combinam";
import { ConviteDeConversa } from "@/components/admin/convite-de-conversa";
import { FormParametrosEmail, IntervaloEmail, LigarEmail } from "@/components/admin/emails-catalogo";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao, Situacao } from "@/components/admin/ui";
import { Selo } from "@/components/ui/basicos";
import { Botao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import {
  avisosDeConvite,
  catalogoDeEmails,
  configDoSite,
  parametrosDeEmail,
  convitesPorEmail,
  creditosDoEmail,
  emailsEnviados,
  emailsPorDia,
  modelosDeEmail,
  ultimosEmails,
  type CreditosEmail,
  type FiltrosEnviados,
  type LinhaDoCatalogo,
  type ParametrosEmail,
} from "@/lib/admin/dados";
import { NOMES_MODELOS_EMAIL, STATUS_EMAIL } from "@/lib/admin/textos";
import { SITE_URL } from "@/lib/config";
import { logoPadraoDoEmail } from "@/lib/email/montar";
import { GRUPOS_DO_CATALOGO, quemRecebe, regrasDoEmail, SAEM_NA_HORA } from "@/lib/emails/catalogo";
import { plural, primeiro, tempoRelativo } from "@/lib/formato";
import { situacaoSmtp } from "@/lib/servidor/ambiente";
import { meetLigado } from "@/lib/servidor/google-meet";
import { ConversasNaAgenda } from "@/components/admin/conversas-na-agenda";
import { mandarCombinamDaSemana } from "@/lib/servidor/combinam";
import { situacaoFilas } from "@/lib/servidor/filas";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "E-mails" };

// sub-abas (claude/plano-central-de-emails.md, parte 4): o dia e o liga e desliga geral, todos os e-mails, o que
// saiu, os convites, os da semana, os textos e a configuração do envio (cada uma lê só o que mostra)
const ABAS = [
  { id: "visao", nome: "Visão geral", icone: Gauge },
  { id: "todos", nome: "Todos os e-mails", icone: ListChecks },
  { id: "enviados", nome: "Enviados", icone: MailCheck },
  { id: "convites", nome: "Convites", icone: Send },
  { id: "conversa", nome: "Agendar conversa", icone: CalendarPlus },
  { id: "semana", nome: "Da semana", icone: Sparkles },
  { id: "textos", nome: "Textos", icone: FileText },
  { id: "configuracoes", nome: "Configurações", icone: Settings },
] as const;
type Aba = (typeof ABAS)[number]["id"];

/** As situações do filtro de Enviados ("fila": na fila ou enviando). */
const SITUACOES_ENVIADOS = [
  { valor: "", nome: "Todas" },
  { valor: "enviado", nome: "Enviados" },
  { valor: "fila", nome: "Na fila" },
  { valor: "falhou", nome: "Falharam" },
  { valor: "cancelado", nome: "Cancelados" },
] as const;

/** Os filtros de Enviados no endereço: ?tipo=<chave do e-mail>&situacao=<situação>&q=<endereço ou nome>. */
function filtrosDe(sp: Record<string, string | string[] | undefined>): FiltrosEnviados {
  const modelo = primeiro(sp.tipo)?.trim() ?? "";
  const situacao = primeiro(sp.situacao)?.trim() ?? "";
  const busca = primeiro(sp.q)?.trim() ?? "";
  return {
    modelo: /^[a-z_]{2,40}$/.test(modelo) ? modelo : null,
    situacao: SITUACOES_ENVIADOS.some((s) => s.valor !== "" && s.valor === situacao) ? situacao : null,
    busca: busca ? busca.slice(0, 120) : null,
  };
}

export default function Emails({ searchParams }: PageProps<"/admin/emails">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => {
        const pedida = primeiro(sp.aba);
        const aba: Aba = ABAS.some((a) => a.id === pedida) ? (pedida as Aba) : "visao";
        return <Conteudo aba={aba} filtros={filtrosDe(sp)} />;
      })}
    </Suspense>
  );
}

function SubAbas({ ativa, falhas }: { ativa: Aba; falhas: number }) {
  return (
    // relative: o texto só para leitores de tela do número de falhas (absolute) fica dentro da faixa que rola, sem
    // alargar a página no celular
    <nav aria-label="E-mails" className="sem-barra relative -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {ABAS.map(({ id, nome, icone: Icone }) => {
        const atual = id === ativa;
        return (
          <Link
            key={id}
            href={id === "visao" ? "/admin/emails" : `/admin/emails?aba=${id}`}
            scroll={false}
            aria-current={atual ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
              atual
                ? "border-ink bg-ink text-surface-100"
                : "border-line bg-surface-300 text-ink hover:border-line-strong"
            }`}
          >
            <Icone aria-hidden className="size-4" />
            {nome}
            {id === "enviados" && falhas > 0 && (
              <span className="rounded-pill bg-danger px-1.5 text-caption text-on-terra tabular-nums">
                {falhas}
                <span className="sr-only"> com falha</span>
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

async function Conteudo({ aba, filtros }: { aba: Aba; filtros: FiltrosEnviados }) {
  const c = await exigirAdminLocal();
  const nada = Promise.resolve(null);
  const [config, modelos, fila, agora, convites, avisos, porDia, gastos, catalogo, numeros, enviados] =
    await Promise.all([
      configDoSite(c),
      aba === "textos" ? modelosDeEmail(c) : Promise.resolve([]),
      ultimosEmails(c, 40),
      agoraDaRequisicao(),
      aba === "convites" ? convitesPorEmail(c) : nada,
      aba === "convites" ? avisosDeConvite(c) : nada,
      aba === "visao" ? emailsPorDia(c, 7) : nada,
      aba === "visao" ? creditosDoEmail(c) : nada,
      aba === "todos" || aba === "convites" || aba === "enviados" ? catalogoDeEmails(c) : nada,
      aba === "todos" ? parametrosDeEmail(c) : nada,
      aba === "enviados" ? emailsEnviados(c, filtros) : nada,
    ]);
  // a prévia das vagas e talentos da semana: a mesma conta, sem mandar nada
  const previa = aba === "semana" ? await mandarCombinamDaSemana({ simular: true }) : null;
  const smtp = situacaoSmtp();
  const filas = situacaoFilas();
  const temFalhas = fila.some((e) => e.status === "falhou");
  // Antes da migração da logo, as colunas novas não existem: vale a logo do Publike, ligada.
  const logoLigada = config.email_logo ?? true;
  const logoPropria = config.email_logo_url ?? null;
  const logoPadrao = logoPadraoDoEmail(SITE_URL);

  return (
    <div className="flex flex-col gap-6">
      <SubAbas ativa={aba} falhas={fila.filter((e) => e.status === "falhou").length} />
      {aba === "visao" && (
        <>
          <Secao
            titulo="Hoje"
            descricao="Os e-mails saem logo depois de cada ação e nas rodadas de 5 minutos. Se o Zoho recusar, o site tenta de novo até três vezes."
            acoes={<BotoesFila temFalhas={temFalhas} />}
          >
            <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-100 p-4 sm:flex-row sm:items-center sm:justify-between">
              <Situacao ok={config.emails_ativos}>
                {config.emails_ativos
                  ? "E-mails ligados: saem os que estão ligados em Todos os e-mails."
                  : "E-mails desligados: nenhum sai (os avisos do sino continuam)."}
              </Situacao>
              <LigarEmailsDoSite ligado={config.emails_ativos} />
            </div>
            {porDia && porDia.length > 0 && <EnviosPorDia dias={porDia} creditos={gastos} agora={agora} />}
            {temFalhas && (
              <p className="text-body-sm">
                <Link
                  href="/admin/emails?aba=enviados&situacao=falhou"
                  className="text-label underline underline-offset-2"
                >
                  Ver os que falharam
                </Link>
                , com o motivo e o “Mandar de novo”.
              </p>
            )}
          </Secao>

          <Secao
            titulo="Envio pelo Zoho CPaaS"
            descricao={
              <>
                O usuário e a senha do SMTP ficam só nas variáveis de ambiente do servidor, nunca aqui. No seu Mac é o{" "}
                <code>.env.local</code>; no site publicado, o painel da hospedagem.
              </>
            }
          >
            <div className="flex flex-col gap-2">
              <Situacao ok={Boolean(smtp.servidor)}>
                Servidor:{" "}
                {smtp.servidor ? (
                  <strong>
                    {smtp.servidor}:{smtp.porta}
                  </strong>
                ) : (
                  "falta SMTP_SERVIDOR (smtp.zeptomail.com)"
                )}
              </Situacao>
              <Situacao ok={Boolean(smtp.usuario)}>
                Usuário: {smtp.usuario ? <strong>{smtp.usuario}</strong> : "falta SMTP_USUARIO (emailapikey)"}
              </Situacao>
              <Situacao ok={smtp.temSenha}>
                Senha:{" "}
                {smtp.temSenha ? "configurada" : "falta SMTP_SENHA (a senha do Agent, em SMTP/API no Zoho CPaaS)"}
              </Situacao>
              <Situacao ok={Boolean(smtp.remetente)}>
                Remetente:{" "}
                {smtp.remetente ? (
                  <strong>{smtp.remetente}</strong>
                ) : (
                  "falta SMTP_REMETENTE (por exemplo, nao-responda@publike.org)"
                )}
              </Situacao>
              <Situacao ok={Boolean(filas.acesso)}>
                Acesso à fila:{" "}
                {filas.acesso === "chave do servidor"
                  ? "chave do servidor"
                  : filas.acesso === "chave secreta"
                    ? "chave secreta do Supabase (só neste computador)"
                    : "falta a chave do servidor"}
                {filas.acesso !== "chave do servidor" && (
                  <>
                    {" · "}
                    <Link href="/admin/chaves" className="underline">
                      criar chave para o site publicado
                    </Link>
                  </>
                )}
              </Situacao>
              <Situacao ok={Boolean(filas.enderecoEmails)}>
                Endereço nos links:{" "}
                {filas.enderecoEmails ? (
                  <strong>{filas.enderecoEmails}</strong>
                ) : (
                  <>
                    falta <code>PUBLIKE_URL_PUBLICA</code> (o endereço do site no ar). Até lá, daqui só sai o e-mail de
                    teste; os avisos para as pessoas esperam o site publicado.
                  </>
                )}
              </Situacao>
            </div>
            <FormEmailTeste sugestao={config.avisos_para[0] ?? ""} />
          </Secao>
        </>
      )}

      {aba === "configuracoes" && (
        <>
          <Secao id="configuracoes" titulo="O que é enviado">
            <FormConfigEmails config={config} />
          </Secao>

          <Secao
            id="logo"
            titulo="Logo nos e-mails"
            descricao="Vai no topo de todos os e-mails do Publike. Os e-mails de entrar e de confirmar o cadastro, que saem pelo Supabase, usam a mesma imagem (eles mostram a logo mesmo com a opção desligada)."
          >
            <FormLogoEmails mostrar={logoLigada} propria={logoPropria} padrao={logoPadrao} />
          </Secao>
        </>
      )}

      {aba === "todos" && (
        <Catalogo catalogo={catalogo} numeros={numeros} ligados={config.emails_ativos} agora={agora} />
      )}

      {aba === "semana" && previa && <DaSemana previa={previa} />}

      {aba === "convites" && (
        <>
          {convites && (
            <Secao
              id="convites"
              titulo="Convites por e-mail"
              descricao="Um e-mail para cada grupo de contas que já existem, uma vez por conta. Segue as regras dos avisos (e-mails ligados, avisos ligados na conta e e-mail confirmado). Mande um teste antes; os textos ficam em Textos dos e-mails, com prévia. Quem entrou pelo celular e não tem e-mail recebe o convite no sino, com o pedido de pôr um e-mail no perfil."
            >
              <ConvitesPorEmail convites={convites} avisos={avisos} sugestao={config.avisos_para[0] ?? ""} />
            </Secao>
          )}

          <Secao
            titulo="Boas-vindas para quem já se cadastrou"
            descricao="Para quem criou a conta, ainda não publicou nada e não recebeu as boas-vindas. Vale o texto de cada perfil e segue as regras dos avisos (opção ligada, avisos ligados e e-mail confirmado). Para mandar a uma pessoa só, mesmo com os avisos desligados, use a página da conta."
          >
            <BoasVindasPendentes />
          </Secao>

          <ForaDaFila catalogo={catalogo} agora={agora} />
        </>
      )}

      {aba === "conversa" && (
        <Secao
          titulo="Agendar conversa com um prospect"
          descricao="Preencha o nome, o e-mail e o horário. Com o Google Meet, um toque cria o evento na sua Google Agenda com a sala e o Google manda o convite, com Aceitar e Recusar. Sem ele, copie o título e a descrição para o evento da sua agenda."
        >
          <ConviteDeConversa meet={meetLigado()} />
        </Secao>
      )}
      {aba === "conversa" && meetLigado() && (
        <Secao titulo="Conversas na agenda" descricao="As conversas com prospects que estão na sua Google Agenda: as próximas e as dos últimos 60 dias, com a resposta de cada convidado.">
          <Suspense fallback={<p className="text-body-sm text-ink-muted">Lendo a agenda…</p>}>
            <ConversasNaAgenda />
          </Suspense>
        </Secao>
      )}

      {aba === "textos" && (
        <Secao
          titulo="Textos dos e-mails"
          descricao="Mude o assunto, o texto e o botão de cada aviso. Os próximos e-mails já saem com o texto novo."
        >
          <TextosDosEmails
            // o texto do convite para empresa de fora é montado em Admin › Convites
            modelos={modelos.filter((m) => !SAEM_NA_HORA[m.chave]?.texto)}
            siteUrl={SITE_URL}
            logo={logoLigada ? (logoPropria ?? logoPadrao) : null}
          />
        </Secao>
      )}

      {aba === "enviados" && (
        <Secao
          titulo="Enviados"
          descricao="Todos os e-mails da fila, o mais novo primeiro (até 100). O que falhou pode ser mandado de novo; o que está desligado em Todos os e-mails sai como cancelado."
          acoes={<BotoesFila temFalhas={temFalhas} />}
        >
          <FiltrosDosEnviados filtros={filtros} catalogo={catalogo} />
          {enviados === null ? (
            <Situacao ok={false}>
              Rode antes a migração <code>20270203120000_emails_enviados.sql</code> no Supabase para filtrar e mandar de
              novo.
            </Situacao>
          ) : enviados.length === 0 ? (
            <p className="flex items-center gap-2 text-body-sm text-ink-muted">
              <MailWarning aria-hidden className="size-4" />
              {filtros.modelo || filtros.situacao || filtros.busca
                ? "Nenhum e-mail com esses filtros."
                : "Nenhum e-mail ainda."}
            </p>
          ) : (
            <TabelaEnviados linhas={enviados} catalogo={catalogo} agora={agora} />
          )}
        </Secao>
      )}
    </div>
  );
}

/** Os filtros de Enviados: o e-mail, a situação e o endereço ou o nome da conta (no endereço da página). */
function FiltrosDosEnviados({ filtros, catalogo }: { filtros: FiltrosEnviados; catalogo: LinhaDoCatalogo[] | null }) {
  const tipos = [...(catalogo ?? [])].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const filtrando = Boolean(filtros.modelo || filtros.situacao || filtros.busca);
  return (
    <form action="/admin/emails" className="flex flex-wrap items-end gap-3" aria-label="Filtrar os e-mails">
      <input type="hidden" name="aba" value="enviados" />
      <label className="flex flex-col gap-1">
        <span className="text-label">E-mail</span>
        <select name="tipo" defaultValue={filtros.modelo ?? ""} className={`${classesEntrada} max-w-72`}>
          <option value="">Todos</option>
          {tipos.map((l) => (
            <option key={l.chave} value={l.chave}>
              {l.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Situação</span>
        <select name="situacao" defaultValue={filtros.situacao ?? ""} className={`${classesEntrada} max-w-44`}>
          {SITUACOES_ENVIADOS.map((s) => (
            <option key={s.valor} value={s.valor}>
              {s.nome}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-label">Para</span>
        <input
          type="search"
          name="q"
          defaultValue={filtros.busca ?? ""}
          placeholder="E-mail ou nome da conta"
          className={`${classesEntrada} max-w-64`}
        />
      </label>
      <Botao type="submit" variante="secundario">
        Filtrar
      </Botao>
      {filtrando && (
        <Link href="/admin/emails?aba=enviados" className="mb-3 text-body-sm underline underline-offset-2">
          Limpar os filtros
        </Link>
      )}
    </form>
  );
}

type LinhaEnviada = NonNullable<Awaited<ReturnType<typeof emailsEnviados>>>[number];

/** A lista de Enviados: o e-mail, para quem (com a conta), a situação com o motivo e o "Mandar de novo", e quando. */
function TabelaEnviados({
  linhas,
  catalogo,
  agora,
}: {
  linhas: LinhaEnviada[];
  catalogo: LinhaDoCatalogo[] | null;
  agora: number;
}) {
  const nomes = new Map((catalogo ?? []).map((l) => [l.chave, l.nome]));
  return (
    <div className="-mx-5 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[44rem] text-left text-body-sm">
        <thead className="text-ink-muted">
          <tr className="border-b border-line">
            <th scope="col" className="px-5 py-2 font-semibold sm:px-2">
              E-mail
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              Para
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              Situação
            </th>
            <th scope="col" className="px-2 py-2 font-semibold">
              Quando
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((e) => (
            <tr key={e.id} className="border-b border-line align-top last:border-0">
              <td className="px-5 py-2.5 sm:px-2">
                {nomes.get(e.modelo) ?? NOMES_MODELOS_EMAIL[e.modelo] ?? e.modelo}
                {/* o "Etapa atualizada": qual etapa e de qual vaga (migração 20270325120000) */}
                {e.etapa && (
                  <span className="mt-1 block">
                    <Selo variante="contorno">{e.etapa}</Selo>
                  </span>
                )}
                {e.vaga && <span className="mt-0.5 block text-caption text-ink-muted normal-case">{e.vaga}</span>}
              </td>
              <td className="px-2 py-2.5">
                <span className="block break-all">{e.para}</span>
                {e.usuario_id && e.nome && (
                  <Link
                    href={`/admin/usuarios/${e.usuario_id}`}
                    className="text-caption text-ink-muted underline underline-offset-2"
                  >
                    {e.nome}
                  </Link>
                )}
              </td>
              <td className="px-2 py-2.5">
                <Selo variante={e.status === "enviado" ? "match" : e.status === "falhou" ? "perigo" : "contorno"}>
                  {STATUS_EMAIL[e.status] ?? e.status}
                </Selo>
                {e.erro && <p className="mt-1 max-w-xs text-ink-muted">{e.erro}</p>}
                {e.status === "falhou" && <MandarDeNovo id={e.id} />}
              </td>
              <td className="px-2 py-2.5 whitespace-nowrap text-ink-muted">
                {tempoRelativo(e.enviado_em ?? e.criado_em, agora)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Vagas e talentos que combinam, toda semana: ligar, como funciona e a prévia desta semana. */
function DaSemana({ previa }: { previa: Awaited<ReturnType<typeof mandarCombinamDaSemana>> }) {
  const semMigracao = previa.semana === undefined;
  const ligado = Boolean(previa.ligado);
  const segunda = previa.semana ? previa.semana.split("-").reverse().join("/") : null;
  return (
    <>
      <Secao
        titulo="Vagas e talentos que combinam"
        descricao="Toda segunda, a partir das 9h: quem tem currículo recebe as vagas novas da semana com 70% de match ou mais, e quem tem vaga no ar recebe os currículos da aba Talentos que combinam com ela (até 5, nunca repete, e “Outra área” fica de fora). Chega no sino, no celular de quem ativou e por e-mail (com os avisos ligados na conta). Só sai para quem tem algo bom."
      >
        {semMigracao ? (
          <Situacao ok={false}>
            Rode antes a migração <code>20261119120000_combinam_da_semana.sql</code> no Supabase.
          </Situacao>
        ) : (
          <div className="flex flex-col gap-3">
            <Situacao ok={ligado}>
              {ligado ? "Ligado." : "Desligado: nada sai até você ligar."} Os textos do e-mail ficam na aba Textos:
              “Vagas que combinam com você” e “Talentos que combinam com as suas vagas”.
            </Situacao>
            <LigarCombinam ligado={ligado} />
          </div>
        )}
      </Secao>
      {!semMigracao && (
        <Secao
          titulo="Volte a contratar"
          descricao={
            <>
              <Selo variante="novo">Novo</Selo> Na mesma segunda: a empresa, o comércio ou a agência sem vaga no ar (a
              última saiu há 14 dias ou mais, nos últimos 6 meses) recebe os currículos da aba Talentos que combinam com
              as vagas de antes, com o botão “Publicar de novo” (a vaga abre preenchida). Só sai com 3 talentos ou mais,
              no máximo a cada 4 semanas, e para depois de 3 avisos sem publicar. Quem desligou os talentos da semana em
              Avisos não recebe.
            </>
          }
        >
          {previa.reativarLigado === undefined ? (
            <Situacao ok={false}>
              Rode antes a migração <code>20270130120000_crescimento_empresas.sql</code> no Supabase.
            </Situacao>
          ) : (
            <div className="flex flex-col gap-3">
              <Situacao ok={previa.reativarLigado}>
                {previa.reativarLigado ? "Ligado." : "Desligado: nada sai até você ligar."} O texto do e-mail fica na
                aba Textos: “Volte a contratar”.
              </Situacao>
              <LigarCombinam ligado={previa.reativarLigado} reativar />
            </div>
          )}
        </Secao>
      )}
      {!semMigracao && (
        <Secao
          titulo={`Prévia da semana de ${segunda}`}
          descricao="A mesma conta do envio, sem mandar nada, com quem ainda não recebeu nesta semana. Os exemplos não dizem para quem iriam."
        >
          <div className="flex flex-col gap-4">
            <p className="text-body-sm">
              <strong>{previa.vagas}</strong> {previa.vagas === 1 ? "pessoa receberia" : "pessoas receberiam"} vagas e{" "}
              <strong>{previa.talentos}</strong> {previa.talentos === 1 ? "conta receberia" : "contas receberiam"}{" "}
              talentos, de {previa.vistos} {previa.vistos === 1 ? "conta vista" : "contas vistas"}.
              {previa.reativarLigado !== undefined && (
                <>
                  {" "}
                  No Volte a contratar, <strong>{previa.reativar}</strong>{" "}
                  {previa.reativar === 1 ? "conta sem vaga no ar receberia" : "contas sem vaga no ar receberiam"}.
                </>
              )}
              {previa.resumos > 0 && (
                <>
                  {" "}
                  Sem talento novo, <strong>{previa.resumos}</strong>{" "}
                  {previa.resumos === 1 ? "conta receberia" : "contas receberiam"} só o resumo das vagas.
                </>
              )}
            </p>
            {(previa.exemplos ?? []).map((x, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-md border border-line bg-surface-100 p-3">
                <p className="text-label">
                  {x.tipo === "vagas_semana"
                    ? "Vagas"
                    : x.tipo === "talentos_reativar"
                      ? "Volte a contratar"
                      : x.tipo === "resumo_vagas"
                        ? "Só o resumo das vagas"
                        : "Talentos"}
                </p>
                <p className="text-body-sm">{x.texto}</p>
                <p className="text-body-sm whitespace-pre-line text-ink-muted">{x.lista}</p>
              </div>
            ))}
            {previa.motivo && <Situacao ok={false}>{previa.motivo}</Situacao>}
          </div>
        </Secao>
      )}
    </>
  );
}

type DiaDeEnvio = { dia: string; enviados: number; falharam: number; na_fila: number };

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "Hoje", "Ontem" ou "seg 20/10" (o dia vem como AAAA-MM-DD, no horário de Brasília). */
function nomeDoDia(dia: string, i: number) {
  if (i === 0) return "Hoje";
  if (i === 1) return "Ontem";
  const [a, m, d] = dia.split("-").map(Number);
  return `${SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** A cor da barra dos créditos pelo quanto já foi: verde, amarelo a partir de 80%, vermelho no fim. */
function corDosCreditos(usados: number, saldo: number) {
  if (usados >= saldo) return "bg-danger";
  return usados >= saldo * 0.8 ? "bg-ipe" : "bg-cerrado";
}

const numero = new Intl.NumberFormat("pt-BR");

/** Os totais do dia e dos últimos 7 dias, com os créditos do ZeptoMail, em cima da lista. */
function EnviosPorDia({
  dias,
  creditos,
  agora,
}: {
  dias: DiaDeEnvio[];
  creditos: CreditosEmail | "vazio" | null;
  agora: number;
}) {
  const hoje = dias[0];
  const topo = Math.max(...dias.map((d) => d.enviados), 1);
  return (
    <div className="mb-5 grid gap-5 rounded-lg border border-line bg-surface-100 p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="flex flex-col gap-2">
        <p className="text-label text-ink-muted">Enviados hoje</p>
        <p className="text-h2 tabular-nums">{hoje.enviados}</p>
        <p className="text-body-sm text-ink-muted">
          {hoje.falharam > 0 ? plural(hoje.falharam, "falhou", "falharam") : "Nenhuma falha"}
          {hoje.na_fila > 0 && ` · ${hoje.na_fila} na fila`}
        </p>
        {creditos && <Creditos creditos={creditos} agora={agora} />}
      </div>
      <div>
        <p className="mb-2 text-label text-ink-muted">Últimos 7 dias</p>
        <ul className="flex flex-col gap-1.5">
          {dias.map((d, i) => (
            <li
              key={d.dia}
              className="grid grid-cols-[4.5rem_minmax(0,1fr)_2.5rem_5.5rem] items-center gap-3 text-body-sm"
            >
              <span className={i === 0 ? "font-semibold" : "text-ink-muted"}>{nomeDoDia(d.dia, i)}</span>
              <span aria-hidden className="h-2 overflow-hidden rounded-pill bg-surface-300">
                <span
                  className="block h-full rounded-pill bg-cerrado"
                  style={{ width: `${(d.enviados / topo) * 100}%` }}
                />
              </span>
              <span className="text-right tabular-nums">{d.enviados}</span>
              <span className="text-danger tabular-nums">
                {d.falharam > 0 && plural(d.falharam, "falhou", "falharam")}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** "08/11/2026" de "2026-11-08" (ou de um timestamp). */
function dataCurta(valor: string) {
  const [a, m, d] = valor.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Os créditos do ZeptoMail: o saldo que a equipe informou menos os e-mails enviados desde então, o próximo
 * vencimento e o formulário para atualizar. Sem créditos, os envios param.
 */
function Creditos({ creditos, agora }: { creditos: CreditosEmail | "vazio"; agora: number }) {
  const tem = creditos !== "vazio";
  const restam = tem ? Math.max(0, creditos.emails - creditos.enviados) : 0;
  // a barra cheia é o total do ZeptoMail (o "/ 20000"); sem ele, o saldo de quando foi informado
  const cheio = tem ? (creditos.total ?? creditos.emails) : 0;
  const hoje = new Date(agora).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const dias =
    tem && creditos.vence_em ? Math.round((Date.parse(creditos.vence_em) - Date.parse(hoje)) / 86_400_000) : null;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
      <p className="text-label text-ink-muted">Créditos do ZeptoMail</p>
      {tem ? (
        <>
          <p className="text-body tabular-nums">
            Restam <strong className="font-semibold">{numero.format(restam)}</strong>
            {creditos.total ? ` de ${numero.format(creditos.total)}` : ""} e-mails
          </p>
          <div
            role="meter"
            aria-label="E-mails que ainda dá para enviar"
            aria-valuemin={0}
            aria-valuemax={cheio}
            aria-valuenow={restam}
            className="h-2 overflow-hidden rounded-pill bg-surface-300"
          >
            <div
              className={`h-full rounded-pill ${corDosCreditos(cheio - restam, cheio)}`}
              style={{ width: `${cheio ? Math.min(100, (restam / cheio) * 100) : 0}%` }}
            />
          </div>
          <p className="text-body-sm text-ink-muted">
            {numero.format(creditos.enviados)} enviados desde {dataCurta(creditos.contado_em)}, quando o saldo era{" "}
            {numero.format(creditos.emails)}.
            {restam === 0 && " Acabou: os e-mails param de sair até comprar mais no ZeptoMail."}
          </p>
          {dias !== null && creditos.vence_em && (
            <p className={`text-body-sm ${dias <= 15 ? "text-danger" : "text-ink-muted"}`}>
              {dias < 0
                ? `Os créditos que venciam em ${dataCurta(creditos.vence_em)} já venceram: confira o saldo no ZeptoMail.`
                : `Próximo vencimento: ${dataCurta(creditos.vence_em)}${dias === 0 ? ", hoje" : `, daqui a ${plural(dias, "dia", "dias")}`}. O que sobrar desses créditos se perde.`}
            </p>
          )}
        </>
      ) : (
        <p className="text-body-sm text-ink-muted">
          O ZeptoMail não deixa o site ler o saldo. Ponha aqui quantos e-mails ele mostra disponíveis, e o site desconta
          cada envio.
        </p>
      )}
      <details className="group" open={!tem}>
        <summary className="cursor-pointer text-body-sm text-ink underline underline-offset-2 group-open:mb-3">
          {tem ? "Atualizar o saldo" : "Informar o saldo"}
        </summary>
        <FormCreditosEmail
          emails={tem ? restam : null}
          total={tem ? creditos.total : null}
          venceEm={tem ? creditos.vence_em : null}
        />
      </details>
    </div>
  );
}

/** Todos os e-mails, por quem recebe: o que dispara, as regras, a chave e os números de 30 dias. */
function Catalogo({
  catalogo,
  numeros,
  ligados,
  agora,
}: {
  catalogo: LinhaDoCatalogo[] | null;
  numeros: ParametrosEmail | null;
  ligados: boolean;
  agora: number;
}) {
  if (!catalogo) {
    return (
      <Secao titulo="Todos os e-mails">
        <Situacao ok={false}>
          Rode antes a migração <code>20270201120000_central_de_emails.sql</code> no Supabase.
        </Situacao>
      </Secao>
    );
  }
  const linhas = catalogo.filter((l) => l.grupo !== "sistema").map((l) => ({ ...l, ...quemRecebe(l.chave, l.grupo) }));
  const desligados = linhas.filter((l) => !l.ligado).length;
  return (
    <>
      <Secao
        titulo="Todos os e-mails"
        descricao="Cada e-mail que o Publike manda, por quem recebe: o que dispara, as regras, a chave de ligar e o que saiu nos últimos 30 dias. Desligado, o e-mail para de sair na hora (o aviso no sino continua). O texto de cada um fica em Textos."
      >
        <div className="flex flex-col gap-2">
          {!ligados && (
            <Situacao ok={false}>
              O envio de e-mails está desligado em Configurações: nada sai, mesmo com as chaves abaixo ligadas.
            </Situacao>
          )}
          <p className="text-body-sm text-ink-muted">
            {plural(linhas.length, "e-mail", "e-mails")}
            {desligados ? `, ${plural(desligados, "desligado", "desligados")}` : ", todos ligados"}.
          </p>
        </div>
      </Secao>
      {numeros && (
        <Secao
          id="numeros"
          titulo="Regras gerais"
          descricao="Os números que valem para vários e-mails. A frequência de cada um fica na linha dele, mais abaixo."
        >
          <FormParametrosEmail numeros={numeros} />
        </Secao>
      )}
      {GRUPOS_DO_CATALOGO.map((g) => {
        const doGrupo = linhas.filter((l) => l.grupo === g.id);
        if (!doGrupo.length) return null;
        return (
          <Secao key={g.id} titulo={g.titulo} descricao={g.ajuda}>
            <ul className="flex flex-col divide-y divide-line" aria-label={g.titulo}>
              {doGrupo.map((l) => (
                <li
                  key={l.chave}
                  id={`email-${l.chave}`}
                  className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2 text-label">
                      {l.nome}
                      {!l.ligado && <Selo variante="perigo">Desligado</Selo>}
                    </p>
                    <p className="max-w-prose text-body-sm">{l.descricao}</p>
                    <ul className="flex flex-col text-body-sm text-ink-muted">
                      {regrasDoEmail(l.chave, l.grupo, l.intervalo_min, numeros).map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                      {l.tambem.length > 0 && <li>Também vai para {l.tambem.join(" e ")}.</li>}
                    </ul>
                    <p className="text-body-sm">
                      <span className="tabular-nums">
                        {plural(l.enviados_7, "enviado", "enviados")} em 7 dias, {l.enviados_30} em 30
                      </span>
                      {l.falhas_30 > 0 && (
                        <span className="text-danger">, {plural(l.falhas_30, "falha", "falhas")}</span>
                      )}
                      {l.cancelados_30 > 0 && <span>, {l.cancelados_30} cancelados</span>}
                      {l.na_fila > 0 && <span>, {l.na_fila} na fila</span>}
                      {". "}
                      <span className="text-ink-muted">
                        {l.ultimo ? `Último: ${tempoRelativo(l.ultimo, agora)}.` : "Nenhum enviado ainda."}
                      </span>{" "}
                      <Link
                        href={SAEM_NA_HORA[l.chave]?.texto?.href ?? `/admin/emails?aba=textos#modelo-${l.chave}`}
                        className="text-label underline underline-offset-2"
                      >
                        {SAEM_NA_HORA[l.chave]?.texto?.nome ?? "Ver o texto"}
                      </Link>
                    </p>
                    {l.grupo !== "equipe" && !l.chave.startsWith("conta_") && l.chave !== "mensagem_equipe" && (
                      <IntervaloEmail modelo={l.chave} nome={l.nome} minutos={l.intervalo_min} />
                    )}
                  </div>
                  <LigarEmail modelo={l.chave} nome={l.nome} ligado={l.ligado} />
                </li>
              ))}
            </ul>
          </Secao>
        );
      })}
    </>
  );
}

/** Os convites que saem por outras telas: o da empresa de fora (Admin › Convites) e o dos testadores. */
function ForaDaFila({ catalogo, agora }: { catalogo: LinhaDoCatalogo[] | null; agora: number }) {
  const convite = catalogo?.find((l) => l.chave === "convite_convidado");
  return (
    <>
      <Secao
        titulo="Convites para empresas de fora"
        descricao="Para a empresa que ainda não está no Publike, achada num anúncio ou num arquivo. A lista, o texto e a assinatura ficam em Admin › Convites; o e-mail sai na hora pelo botão de cada convidado. A chave fica em Todos os e-mails."
      >
        <div className="flex flex-col gap-2">
          {convite ? (
            <Situacao ok={convite.ligado}>
              {convite.ligado ? "Ligado." : "Desligado: o botão de e-mail dos convidados não manda nada."}{" "}
              {plural(convite.enviados_30, "convite enviado", "convites enviados")} em 30 dias
              {convite.ultimo ? `, o último ${tempoRelativo(convite.ultimo, agora)}` : ""}.
            </Situacao>
          ) : (
            <Situacao ok={false}>
              Rode antes a migração <code>20270201120000_central_de_emails.sql</code> no Supabase.
            </Situacao>
          )}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm">
            <Link href="/admin/convites" className="text-label underline underline-offset-2">
              Abrir os convidados
            </Link>
            <Link
              href="/admin/emails?aba=todos#email-convite_convidado"
              className="text-label underline underline-offset-2"
            >
              Ligar ou desligar
            </Link>
          </p>
        </div>
      </Secao>
      <Secao
        titulo="Convite dos testadores do app"
        descricao="O convite do teste fechado na Play abre o WhatsApp ou o programa de e-mail do seu computador, com a mensagem pronta, e você envia. Por isso ele não passa pelo Publike nem entra nos números daqui."
      >
        <Link href="/admin/testadores" className="text-label underline underline-offset-2">
          Abrir os testadores
        </Link>
      </Secao>
    </>
  );
}
