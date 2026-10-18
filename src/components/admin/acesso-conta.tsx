"use client";

import { Copy, KeyRound, Link2, MessageCircle } from "lucide-react";
import { startTransition, useActionState, useState, type FormEvent } from "react";
import { alterarLoginPeloAdmin, gerarAcessoPorWhatsapp, gerarLinkDeAcesso } from "@/lib/acoes/admin-contas";
import { formatarTelefone } from "@/lib/formato";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";

/**
 * Login da conta pelo admin: trocar o e-mail e o celular de login (a pessoa
 * perdeu o acesso ao antigo) e gerar um link de entrar para mandar pelo WhatsApp.
 */
export function AcessoDaConta({
  usuarioId,
  email,
  telefone,
  whatsappContato,
}: {
  usuarioId: string;
  email: string | null;
  telefone: string | null;
  whatsappContato: string | null;
}) {
  const [estado, acao, salvando] = useActionState(alterarLoginPeloAdmin.bind(null, usuarioId), {
    ok: false,
  } as EstadoForm);
  const erros = estado.erros ?? {};
  const [link, setLink] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }

  async function gerar() {
    setGerando(true);
    setAviso(null);
    setLink(null);
    const r = await gerarLinkDeAcesso(usuarioId);
    setGerando(false);
    if (r.ok && r.link) setLink(r.link);
    else if (!r.ok) setAviso(r.erro);
  }

  const zap = (whatsappContato ?? telefone ?? "").replace(/\D/g, "");
  const mensagemZap = link
    ? `Oi! Aqui é do Publike. Este é o seu link para entrar na sua conta (vale uma vez, por pouco tempo): ${link}`
    : "";

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={enviar} noValidate className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            rotulo="E-mail de login"
            nome="email_login"
            opcional
            erro={erros.email_login}
            ajuda="Troca na hora, já confirmado. Confira com a pessoa antes."
          >
            <input
              {...ligarCampo("email_login", erros.email_login, true)}
              type="email"
              autoComplete="off"
              defaultValue={email ?? ""}
              placeholder="nome@email.com"
              className={classesEntrada}
            />
          </Campo>
          <Campo
            rotulo="Celular de login"
            nome="telefone_login"
            opcional
            erro={erros.telefone_login}
            ajuda="Para entrar com o código por SMS."
          >
            <input
              {...ligarCampo("telefone_login", erros.telefone_login, true)}
              inputMode="tel"
              autoComplete="off"
              defaultValue={telefone ? formatarTelefone(telefone) : ""}
              placeholder="(62) 99999-0000"
              className={classesEntrada}
            />
          </Campo>
        </div>
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" name="atualizar_contato" className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]" />
          <span className="text-body-sm">
            <span className="block text-label">Usar também como contato</span>
            <span className="text-ink-muted">
              O WhatsApp e o e-mail que aparecem para quem dá match passam a ser estes.
            </span>
          </span>
        </label>
        {estado.erro && !Object.keys(erros).length && <Aviso tipo="erro">{estado.erro}</Aviso>}
        {estado.ok && estado.mensagem && <Aviso tipo="sucesso">{estado.mensagem}</Aviso>}
        <Botao type="submit" disabled={salvando} className="self-start">
          <KeyRound aria-hidden />
          {salvando ? "Salvando…" : "Salvar o login"}
        </Botao>
      </form>

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <div>
          <h3 className="text-label">O e-mail não chega?</h3>
          <p className="text-body-sm text-ink-muted">
            Gere um link de entrar e mande você mesmo para a pessoa, pelo WhatsApp. Ele vale uma vez e por pouco tempo:
            mande só para a dona da conta.
          </p>
        </div>
        <Botao tamanho="sm" variante="secundario" disabled={gerando} onClick={gerar} className="self-start">
          <Link2 aria-hidden />
          {gerando ? "Gerando…" : link ? "Gerar outro link" : "Gerar link de acesso"}
        </Botao>
        {aviso && <Aviso tipo="erro">{aviso}</Aviso>}
        {link && (
          <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3">
            <code className="text-body-sm break-all">{link}</code>
            <div className="flex flex-wrap gap-2">
              <Botao
                tamanho="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 2000);
                  } catch {}
                }}
              >
                <Copy aria-hidden />
                {copiado ? "Copiado" : "Copiar o link"}
              </Botao>
              {zap.length >= 12 && (
                <a
                  href={`https://wa.me/${zap}?text=${encodeURIComponent(mensagemZap)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-cerrado px-3.5 text-label text-on-cerrado"
                >
                  <MessageCircle aria-hidden className="size-[18px]" />
                  Mandar no WhatsApp {formatarTelefone(zap)}
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Conta sem e-mail de login: a mensagem para o WhatsApp com o link /acesso/<token>. A empresa
 * abre, coloca o e-mail e ele vira o login (o Publike entra só pelo e-mail).
 */
export function AcessoPorWhatsapp({ usuarioId }: { usuarioId: string }) {
  const [gerado, setGerado] = useState<{ whatsapp: string; mensagem: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  async function gerar() {
    setGerando(true);
    setErro(null);
    const r = await gerarAcessoPorWhatsapp(usuarioId);
    setGerando(false);
    if (r.ok) setGerado({ whatsapp: r.whatsapp, mensagem: r.mensagem });
    else setErro(r.erro);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-sm text-ink-muted">
        Esta conta não tem e-mail de login, e o Publike entra só pelo e-mail. Mande pelo WhatsApp o link de acesso: a
        empresa abre, coloca o e-mail dela e entra com ele (o e-mail fica ligado à conta, à vaga e ao WhatsApp).
      </p>
      {!gerado && (
        <Botao variante="sucesso" tamanho="sm" disabled={gerando} onClick={gerar} className="self-start">
          <MessageCircle aria-hidden />
          {gerando ? "Gerando…" : "Mandar o acesso pelo WhatsApp"}
        </Botao>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {gerado && (
        <div className="flex flex-col gap-2 rounded-md bg-surface-300 p-3">
          <p className="text-body-sm whitespace-pre-wrap">{gerado.mensagem}</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://wa.me/${gerado.whatsapp}?text=${encodeURIComponent(gerado.mensagem)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-cerrado px-3.5 text-label text-on-cerrado"
            >
              <MessageCircle aria-hidden className="size-4" />
              Abrir o WhatsApp {formatarTelefone(gerado.whatsapp)}
            </a>
            <Botao
              tamanho="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(gerado.mensagem);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 2000);
                } catch {}
              }}
            >
              <Copy aria-hidden />
              {copiado ? "Copiada" : "Copiar mensagem"}
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
