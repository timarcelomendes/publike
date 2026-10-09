"use client";

import { RefreshCw, RotateCcw, Send } from "lucide-react";
import { useActionState, useMemo, useRef, useState } from "react";
import {
  enviarEmailDeTeste,
  processarFilasAgora,
  reenviarEmailsComFalha,
  restaurarModeloEmail,
  salvarConfigEmails,
  salvarModeloEmail,
} from "@/lib/acoes/admin";
import type { ConfigSite, ModeloEmailAdmin } from "@/lib/admin/dados";
import { EXEMPLOS_EMAIL, montarEmail } from "@/lib/email/montar";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso, Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

const INICIAL: EstadoForm = { ok: false };

function Resultado({ estado }: { estado: EstadoForm }) {
  if (estado.erro) return <Aviso tipo="erro">{estado.erro}</Aviso>;
  if (estado.ok && estado.mensagem) return <Aviso tipo="sucesso">{estado.mensagem}</Aviso>;
  return null;
}

function Opcao({ nome, rotulo, ajuda, inicial }: { nome: string; rotulo: string; ajuda?: string; inicial: boolean }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3">
      <input type="checkbox" name={nome} defaultChecked={inicial} className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]" />
      <span>
        <span className="block text-label">{rotulo}</span>
        {ajuda && <span className="block text-body-sm text-ink-muted">{ajuda}</span>}
      </span>
    </label>
  );
}

// ------------------------------------------------------------------ teste

export function FormEmailTeste({ sugestao }: { sugestao: string }) {
  const [estado, acao, enviando] = useActionState(enviarEmailDeTeste, INICIAL);
  return (
    <form action={acao} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <Campo rotulo="Mandar um e-mail de teste para" nome="para" erro={estado.erros?.para} className="flex-1">
          <input
            {...ligarCampo("para", estado.erros?.para)}
            type="email"
            defaultValue={sugestao}
            required
            autoComplete="email"
            className={classesEntrada}
          />
        </Campo>
        <Botao type="submit" disabled={enviando} className="sm:mb-px">
          <Send aria-hidden />
          {enviando ? "Enviando…" : "Enviar teste"}
        </Botao>
      </div>
      <Resultado estado={estado} />
    </form>
  );
}

// ------------------------------------------------------------------ configurações

export function FormConfigEmails({ config }: { config: ConfigSite }) {
  const [estado, acao, enviando] = useActionState(salvarConfigEmails, INICIAL);
  const erros = estado.erros ?? {};
  return (
    <form action={acao} className="flex flex-col gap-6">
      <Opcao
        nome="emails_ativos"
        rotulo="Mandar e-mails do site"
        ajuda="Desligado, nenhum aviso sai por e-mail (os avisos do sino continuam)."
        inicial={config.emails_ativos}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome do remetente" nome="remetente_nome" erro={erros.remetente_nome}>
          <input
            {...ligarCampo("remetente_nome", erros.remetente_nome)}
            defaultValue={config.remetente_nome}
            maxLength={60}
            className={classesEntrada}
          />
        </Campo>
        <Campo
          rotulo="Responder para"
          nome="responder_para"
          opcional
          erro={erros.responder_para}
          ajuda="Se alguém responder a um aviso, a resposta vai para este e-mail."
        >
          <input
            {...ligarCampo("responder_para", erros.responder_para, true)}
            type="email"
            defaultValue={config.responder_para ?? ""}
            className={classesEntrada}
          />
        </Campo>
      </div>

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-label">Avisos para quem usa o site</legend>
        <Opcao nome="email_curtida" rotulo="Curtida" ajuda="No máximo um e-mail a cada 30 minutos por pessoa." inicial={config.email_curtida} />
        <Opcao nome="email_match" rotulo="Match" inicial={config.email_match} />
        <Opcao nome="email_moderacao" rotulo="Moderação" ajuda="Anúncio em análise, removido ou liberado." inicial={config.email_moderacao} />
        <Opcao nome="email_conta" rotulo="Conta" ajuda="Suspensão, banimento e reativação. Vai mesmo para quem desligou os avisos." inicial={config.email_conta} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label">Avisos para a equipe</legend>
        <Campo
          rotulo="Quem recebe"
          nome="avisos_para"
          erro={erros.avisos_para}
          ajuda="Um ou mais e-mails, separados por vírgula. Em branco, ninguém recebe."
        >
          <input
            {...ligarCampo("avisos_para", erros.avisos_para, true)}
            defaultValue={config.avisos_para.join(", ")}
            placeholder="voce@publike.org"
            className={classesEntrada}
          />
        </Campo>
        <div className="flex flex-col gap-1">
          <Opcao nome="aviso_denuncia" rotulo="Nova denúncia" ajuda="No máximo um por anúncio a cada hora." inicial={config.aviso_denuncia} />
          <Opcao nome="aviso_cadastro" rotulo="Novo cadastro" ajuda="Quando alguém cria o perfil." inicial={config.aviso_cadastro} />
          <Opcao
            nome="aviso_retirado"
            rotulo="Anúncio tirado do ar"
            ajuda="Quando três denúncias ou a IA tiram um anúncio do ar."
            inicial={config.aviso_retirado}
          />
        </div>
      </fieldset>

      <Resultado estado={estado} />
      <div>
        <Botao type="submit" variante="primario" disabled={enviando}>
          {enviando ? "Salvando…" : "Salvar configurações"}
        </Botao>
      </div>
    </form>
  );
}

// ------------------------------------------------------------------ textos

function EditorModelo({ m, siteUrl }: { m: ModeloEmailAdmin; siteUrl: string }) {
  const [estado, acao, enviando] = useActionState(salvarModeloEmail, INICIAL);
  const restaurar = useAcao();
  const [assunto, setAssunto] = useState(m.assunto);
  const [corpo, setCorpo] = useState(m.corpo);
  const [botao, setBotao] = useState(m.botao ?? "");
  const caixaCorpo = useRef<HTMLTextAreaElement>(null);

  const previa = useMemo(
    () => montarEmail({ modelo: m.chave, grupo: m.grupo, assunto, corpo, botao: botao || null }, EXEMPLOS_EMAIL, siteUrl),
    [m.chave, m.grupo, assunto, corpo, botao, siteUrl],
  );

  function inserir(variavel: string) {
    const caixa = caixaCorpo.current;
    const trecho = `{{${variavel}}}`;
    if (!caixa) return setCorpo((c) => c + trecho);
    const inicio = caixa.selectionStart ?? corpo.length;
    const fim = caixa.selectionEnd ?? corpo.length;
    const novo = corpo.slice(0, inicio) + trecho + corpo.slice(fim);
    setCorpo(novo);
    requestAnimationFrame(() => {
      caixa.focus();
      caixa.setSelectionRange(inicio + trecho.length, inicio + trecho.length);
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form action={acao} className="flex flex-col gap-4">
        <input type="hidden" name="chave" value={m.chave} />
        <Campo rotulo="Assunto" nome={`assunto-${m.chave}`}>
          <input
            id={`assunto-${m.chave}`}
            name="assunto"
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            maxLength={150}
            className={classesEntrada}
          />
        </Campo>
        <Campo
          rotulo="Texto"
          nome={`corpo-${m.chave}`}
          ajuda="Deixe uma linha em branco entre os parágrafos. Parágrafo com variável vazia não aparece."
        >
          <textarea
            ref={caixaCorpo}
            id={`corpo-${m.chave}`}
            name="corpo"
            value={corpo}
            onChange={(e) => setCorpo(e.target.value)}
            rows={9}
            maxLength={5000}
            aria-describedby={`corpo-${m.chave}-ajuda`}
            className={`${classesEntrada} resize-y font-mono text-body-sm`}
          />
        </Campo>
        <div className="flex flex-col gap-1.5">
          <span className="text-label">Variáveis</span>
          <div className="flex flex-wrap gap-2">
            {m.variaveis.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => inserir(v)}
                className="min-h-9 rounded-pill border border-line bg-surface-300 px-3 font-mono text-body-sm hover:border-line-strong"
                title="Inserir no texto"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>
        <Campo rotulo="Texto do botão" nome={`botao-${m.chave}`} opcional ajuda="O botão leva para a página certa do site.">
          <input
            id={`botao-${m.chave}`}
            name="botao"
            value={botao}
            onChange={(e) => setBotao(e.target.value)}
            maxLength={40}
            className={classesEntrada}
          />
        </Campo>
        <Resultado estado={estado} />
        <div className="flex flex-wrap gap-2">
          <Botao type="submit" disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar texto"}
          </Botao>
          {m.alterado && (
            <Botao
              variante="fantasma"
              disabled={restaurar.pendente}
              onClick={() =>
                restaurar.rodar(
                  () => restaurarModeloEmail(m.chave),
                  (r) => {
                    if (r.ok) window.location.reload();
                  },
                )
              }
            >
              <RotateCcw aria-hidden />
              Voltar ao original
            </Botao>
          )}
        </div>
        {restaurar.mensagem}
      </form>
      <div className="flex flex-col gap-2">
        <span className="text-label">Prévia (com dados de exemplo)</span>
        <p className="rounded-sm bg-surface-300 px-3 py-2 text-body-sm">
          <span className="text-ink-muted">Assunto: </span>
          {previa.assunto}
        </p>
        <iframe
          title={`Prévia do e-mail ${m.nome}`}
          srcDoc={previa.html}
          sandbox=""
          className="h-[26rem] w-full rounded-md border border-line bg-white"
        />
      </div>
    </div>
  );
}

export function TextosDosEmails({ modelos, siteUrl }: { modelos: ModeloEmailAdmin[]; siteUrl: string }) {
  const grupos = [
    { chave: "usuarios", titulo: "Para quem usa o site" },
    { chave: "equipe", titulo: "Para a equipe" },
    { chave: "sistema", titulo: "Outros" },
  ];
  return (
    <div className="flex flex-col gap-6">
      {grupos.map((g) => {
        const lista = modelos.filter((m) => m.grupo === g.chave);
        if (!lista.length) return null;
        return (
          <div key={g.chave} className="flex flex-col gap-2">
            <h3 className="text-label text-ink-muted">{g.titulo}</h3>
            {lista.map((m) => (
              <details key={m.chave} className="group rounded-md border border-line">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:hidden">
                  <span className="flex min-w-0 flex-col">
                    <span className="flex flex-wrap items-center gap-2 text-label">
                      {m.nome}
                      {m.alterado && <Selo variante="contorno">Editado</Selo>}
                    </span>
                    <span className="text-body-sm text-ink-muted">{m.descricao}</span>
                  </span>
                  <span aria-hidden className="text-h3 text-ink-muted transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <div className="border-t border-line p-4">
                  <EditorModelo m={m} siteUrl={siteUrl} />
                </div>
              </details>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ fila

export function BotoesFila({ temFalhas }: { temFalhas: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(processarFilasAgora)}>
          <Send aria-hidden />
          Enviar a fila agora
        </Botao>
        {temFalhas && (
          <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={() => rodar(reenviarEmailsComFalha)}>
            <RefreshCw aria-hidden />
            Tentar de novo os que falharam
          </Botao>
        )}
      </div>
      {mensagem}
    </div>
  );
}
