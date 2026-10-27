import { FileText, MailCheck, MailWarning, Send, Settings, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  BoasVindasPendentes,
  BotoesFila,
  ConvitesPorEmail,
  FormConfigEmails,
  FormEmailTeste,
  FormLogoEmails,
  TextosDosEmails,
} from "@/components/admin/emails";
import { LigarCombinam } from "@/components/admin/combinam";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao, Situacao } from "@/components/admin/ui";
import { Selo } from "@/components/ui/basicos";
import {
  avisosDeConvite,
  configDoSite,
  convitesPorEmail,
  emailsEnviadosDesde,
  emailsPorDia,
  modelosDeEmail,
  ultimosEmails,
} from "@/lib/admin/dados";
import { NOMES_MODELOS_EMAIL, STATUS_EMAIL } from "@/lib/admin/textos";
import { SITE_URL } from "@/lib/config";
import { logoPadraoDoEmail } from "@/lib/email/montar";
import { plural, primeiro, tempoRelativo } from "@/lib/formato";
import { situacaoSmtp } from "@/lib/servidor/ambiente";
import { mandarCombinamDaSemana } from "@/lib/servidor/combinam";
import { situacaoFilas } from "@/lib/servidor/filas";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "E-mails" };

/**
 * Os créditos do ZeptoMail (um por e-mail): o saldo e desde quando ele vale. A conta foi aprovada em
 * 27/10/2026 (sem o limite de 100 por dia) com 10.000 créditos. Ao comprar mais, ponha o novo saldo
 * (o que o ZeptoMail mostra) e a data da compra. null: sem os créditos à vista.
 */
const CREDITOS: { saldo: number; desde: string } | null = { saldo: 10_000, desde: "2026-10-27T18:00:00-03:00" };

// sub-abas: o que saiu, a configuração do envio, os convites e os textos (cada uma lê só o que mostra)
const ABAS = [
  { id: "enviados", nome: "Enviados", icone: MailCheck },
  { id: "configuracoes", nome: "Configurações", icone: Settings },
  { id: "convites", nome: "Convites", icone: Send },
  { id: "semana", nome: "Da semana", icone: Sparkles },
  { id: "textos", nome: "Textos", icone: FileText },
] as const;
type Aba = (typeof ABAS)[number]["id"];

export default function Emails({ searchParams }: PageProps<"/admin/emails">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {searchParams.then((sp) => {
        const pedida = primeiro(sp.aba);
        const aba: Aba = ABAS.some((a) => a.id === pedida) ? (pedida as Aba) : "enviados";
        return <Conteudo aba={aba} />;
      })}
    </Suspense>
  );
}

function SubAbas({ ativa, falhas }: { ativa: Aba; falhas: number }) {
  return (
    <nav aria-label="E-mails" className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
      {ABAS.map(({ id, nome, icone: Icone }) => {
        const atual = id === ativa;
        return (
          <Link
            key={id}
            href={id === "enviados" ? "/admin/emails" : `/admin/emails?aba=${id}`}
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

async function Conteudo({ aba }: { aba: Aba }) {
  const c = await exigirAdminLocal();
  const nada = Promise.resolve(null);
  const [config, modelos, fila, agora, convites, avisos, porDia, gastos] = await Promise.all([
    configDoSite(c),
    aba === "textos" ? modelosDeEmail(c) : Promise.resolve([]),
    ultimosEmails(c, 40),
    agoraDaRequisicao(),
    aba === "convites" ? convitesPorEmail(c) : nada,
    aba === "convites" ? avisosDeConvite(c) : nada,
    aba === "enviados" ? emailsPorDia(c, 7) : nada,
    aba === "enviados" && CREDITOS ? emailsEnviadosDesde(c, CREDITOS.desde) : nada,
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
      {aba === "configuracoes" && (
        <>
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
        </>
      )}

      {aba === "textos" && (
        <Secao
          titulo="Textos dos e-mails"
          descricao="Mude o assunto, o texto e o botão de cada aviso. Os próximos e-mails já saem com o texto novo."
        >
          <TextosDosEmails
            modelos={modelos}
            siteUrl={SITE_URL}
            logo={logoLigada ? (logoPropria ?? logoPadrao) : null}
          />
        </Secao>
      )}

      {aba === "enviados" && (
        <Secao
          titulo="Últimos e-mails"
          descricao="Os e-mails saem logo depois de cada ação. Se o Zoho recusar, o site tenta de novo até três vezes."
          acoes={<BotoesFila temFalhas={temFalhas} />}
        >
          {porDia && porDia.length > 0 && <EnviosPorDia dias={porDia} gastos={gastos} />}
          {fila.length === 0 ? (
            <p className="flex items-center gap-2 text-body-sm text-ink-muted">
              <MailWarning aria-hidden className="size-4" />
              Nenhum e-mail ainda.
            </p>
          ) : (
            <div className="-mx-5 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[40rem] text-left text-body-sm">
                <thead className="text-ink-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="px-5 py-2 font-semibold sm:px-2">
                      Aviso
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
                  {fila.map((e) => (
                    <tr key={e.id} className="border-b border-line align-top last:border-0">
                      <td className="px-5 py-2.5 sm:px-2">{NOMES_MODELOS_EMAIL[e.modelo] ?? e.modelo}</td>
                      <td className="px-2 py-2.5 break-all">{e.para}</td>
                      <td className="px-2 py-2.5">
                        <Selo
                          variante={e.status === "enviado" ? "match" : e.status === "falhou" ? "perigo" : "contorno"}
                        >
                          {STATUS_EMAIL[e.status] ?? e.status}
                        </Selo>
                        {e.erro && <p className="mt-1 max-w-xs text-ink-muted">{e.erro}</p>}
                      </td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-ink-muted">
                        {tempoRelativo(e.enviado_em ?? e.criado_em, agora)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Secao>
      )}
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
          titulo={`Prévia da semana de ${segunda}`}
          descricao="A mesma conta do envio, sem mandar nada, com quem ainda não recebeu nesta semana. Os exemplos não dizem para quem iriam."
        >
          <div className="flex flex-col gap-4">
            <p className="text-body-sm">
              <strong>{previa.vagas}</strong> {previa.vagas === 1 ? "pessoa receberia" : "pessoas receberiam"} vagas e{" "}
              <strong>{previa.talentos}</strong> {previa.talentos === 1 ? "conta receberia" : "contas receberiam"}{" "}
              talentos, de {previa.vistos} {previa.vistos === 1 ? "conta vista" : "contas vistas"}.
            </p>
            {(previa.exemplos ?? []).map((x, i) => (
              <div key={i} className="flex flex-col gap-1 rounded-md border border-line bg-surface-100 p-3">
                <p className="text-label">{x.tipo === "vagas_semana" ? "Vagas" : "Talentos"}</p>
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
function EnviosPorDia({ dias, gastos }: { dias: DiaDeEnvio[]; gastos: number | null }) {
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
        {CREDITOS && gastos !== null && <Creditos usados={gastos} saldo={CREDITOS.saldo} desde={CREDITOS.desde} />}
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

/** Os créditos do ZeptoMail: quantos e-mails saíram desde a compra, do saldo. Sem créditos, os envios param. */
function Creditos({ usados, saldo, desde }: { usados: number; saldo: number; desde: string }) {
  const restam = Math.max(0, saldo - usados);
  const [a, m, d] = desde.slice(0, 10).split("-");
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
      <p className="text-label text-ink-muted">Créditos do ZeptoMail</p>
      <p className="text-body tabular-nums">
        <strong className="font-semibold">{numero.format(usados)}</strong> de {numero.format(saldo)} usados
      </p>
      <div
        role="meter"
        aria-label="Créditos do ZeptoMail usados"
        aria-valuemin={0}
        aria-valuemax={saldo}
        aria-valuenow={usados}
        className="h-2 overflow-hidden rounded-pill bg-surface-300"
      >
        <div
          className={`h-full rounded-pill ${corDosCreditos(usados, saldo)}`}
          style={{ width: `${Math.min(100, (usados / saldo) * 100)}%` }}
        />
      </div>
      <p className="text-body-sm text-ink-muted">
        {restam > 0
          ? `Restam ${numero.format(restam)}, contando desde ${d}/${m}/${a}. Sem créditos, os e-mails param de sair: compre mais no ZeptoMail antes de acabar.`
          : "Os créditos acabaram: os e-mails param de sair até comprar mais no ZeptoMail."}
      </p>
    </div>
  );
}
