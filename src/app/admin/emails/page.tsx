import { FileText, MailCheck, MailWarning, Send, Settings } from "lucide-react";
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
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao, Situacao } from "@/components/admin/ui";
import { Selo } from "@/components/ui/basicos";
import { avisosDeConvite, configDoSite, convitesPorEmail, modelosDeEmail, ultimosEmails } from "@/lib/admin/dados";
import { NOMES_MODELOS_EMAIL, STATUS_EMAIL } from "@/lib/admin/textos";
import { SITE_URL } from "@/lib/config";
import { logoPadraoDoEmail } from "@/lib/email/montar";
import { primeiro, tempoRelativo } from "@/lib/formato";
import { situacaoSmtp } from "@/lib/servidor/ambiente";
import { situacaoFilas } from "@/lib/servidor/filas";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "E-mails" };

// sub-abas: o que saiu, a configuração do envio, os convites e os textos (cada uma lê só o que mostra)
const ABAS = [
  { id: "enviados", nome: "Enviados", icone: MailCheck },
  { id: "configuracoes", nome: "Configurações", icone: Settings },
  { id: "convites", nome: "Convites", icone: Send },
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
  const [config, modelos, fila, agora, convites, avisos] = await Promise.all([
    configDoSite(c),
    aba === "textos" ? modelosDeEmail(c) : Promise.resolve([]),
    ultimosEmails(c, 40),
    agoraDaRequisicao(),
    aba === "convites" ? convitesPorEmail(c) : nada,
    aba === "convites" ? avisosDeConvite(c) : nada,
  ]);
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
