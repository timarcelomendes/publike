import { MailWarning } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotoesFila, FormConfigEmails, FormEmailTeste, TextosDosEmails } from "@/components/admin/emails";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { Secao, Situacao } from "@/components/admin/ui";
import { Selo } from "@/components/ui/basicos";
import { configDoSite, modelosDeEmail, ultimosEmails } from "@/lib/admin/dados";
import { NOMES_MODELOS_EMAIL, STATUS_EMAIL } from "@/lib/admin/textos";
import { SITE_URL } from "@/lib/config";
import { tempoRelativo } from "@/lib/formato";
import { situacaoSmtp } from "@/lib/servidor/ambiente";
import { situacaoFilas } from "@/lib/servidor/filas";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "E-mails" };

export default function Emails() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const [config, modelos, fila, agora] = await Promise.all([
    configDoSite(c),
    modelosDeEmail(c),
    ultimosEmails(c, 40),
    agoraDaRequisicao(),
  ]);
  const smtp = situacaoSmtp();
  const filas = situacaoFilas();
  const temFalhas = fila.some((e) => e.status === "falhou");

  return (
    <div className="flex flex-col gap-6">
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
            Servidor: {smtp.servidor ? <strong>{smtp.servidor}:{smtp.porta}</strong> : "falta SMTP_SERVIDOR (smtp.zeptomail.com)"}
          </Situacao>
          <Situacao ok={Boolean(smtp.usuario)}>
            Usuário: {smtp.usuario ? <strong>{smtp.usuario}</strong> : "falta SMTP_USUARIO (emailapikey)"}
          </Situacao>
          <Situacao ok={smtp.temSenha}>
            Senha: {smtp.temSenha ? "configurada" : "falta SMTP_SENHA (a senha do Agent, em SMTP/API no Zoho CPaaS)"}
          </Situacao>
          <Situacao ok={Boolean(smtp.remetente)}>
            Remetente:{" "}
            {smtp.remetente ? <strong>{smtp.remetente}</strong> : "falta SMTP_REMETENTE (por exemplo, nao-responda@publike.org)"}
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
                falta <code>PUBLIKE_URL_PUBLICA</code> (o endereço do site no ar). Até lá, daqui só sai o e-mail de teste; os
                avisos para as pessoas esperam o site publicado.
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
        titulo="Textos dos e-mails"
        descricao="Mude o assunto, o texto e o botão de cada aviso. Os próximos e-mails já saem com o texto novo."
      >
        <TextosDosEmails modelos={modelos} siteUrl={SITE_URL} />
      </Secao>

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
                  <th scope="col" className="px-5 py-2 font-semibold sm:px-2">Aviso</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Para</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Situação</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Quando</th>
                </tr>
              </thead>
              <tbody>
                {fila.map((e) => (
                  <tr key={e.id} className="border-b border-line align-top last:border-0">
                    <td className="px-5 py-2.5 sm:px-2">{NOMES_MODELOS_EMAIL[e.modelo] ?? e.modelo}</td>
                    <td className="px-2 py-2.5 break-all">{e.para}</td>
                    <td className="px-2 py-2.5">
                      <Selo variante={e.status === "enviado" ? "match" : e.status === "falhou" ? "perigo" : "contorno"}>
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
    </div>
  );
}
