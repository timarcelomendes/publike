"use client";

import { CircleCheck, MailX } from "lucide-react";
import { useState, useTransition } from "react";
import { responderEmailEmpresas } from "@/lib/acoes/email-empresas";
import { chamarAcao } from "@/lib/acao-segura";
import { Botao, BotaoLink } from "../ui/botao";
import { Campo, classesEntrada } from "../ui/campo";

/**
 * A resposta ao e-mail às empresas (migração 20270722120000): "Sim, podem publicar", com onde estão as vagas, o
 * telefone e um recado, se quiser; ou "Não quero receber". Pede o toque aqui: leitores de link abrem o endereço do
 * e-mail sozinhos, e o sim não pode sair deles.
 */
export function RespostaEmailEmpresas({
  token,
  empresa,
  jaDisse,
  linkInicial,
  sair,
}: {
  token: string;
  empresa: string;
  jaDisse: "sim" | "nao" | null;
  linkInicial: string | null;
  /** veio pelo "Não quero receber" do e-mail */
  sair: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const [feito, setFeito] = useState<"sim" | "nao" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState(linkInicial ?? "");
  const [telefone, setTelefone] = useState("");
  const [recado, setRecado] = useState("");

  function responder(resposta: "sim" | "nao") {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() =>
        responderEmailEmpresas(token, resposta, { link, telefone, observacao: recado }),
      );
      if (r.ok) setFeito(r.resposta);
      else setErro(r.erro);
    });
  }

  if (feito === "sim" || (jaDisse === "sim" && !feito && !sair)) {
    return (
      <section aria-live="polite" className="rounded-lg border border-line bg-surface-200 p-6 shadow-card">
        <CircleCheck aria-hidden className="size-7 text-cerrado-text" />
        <h1 className="mt-3 text-h2">Obrigado!</h1>
        <p className="mt-2 text-body">
          Vamos publicar as vagas da <strong>{empresa}</strong> no Publike e avisamos por e-mail quando estiverem no ar.
        </p>
        <p className="mt-2 text-body-sm text-ink-muted">
          Quer mandar mais alguma coisa? É só responder o e-mail. Se preferir publicar vocês mesmos, é de graça.
        </p>
        <div className="mt-5">
          <BotaoLink href="/publicar" variante="secundario">
            Publicar uma vaga agora
          </BotaoLink>
        </div>
      </section>
    );
  }

  if (feito === "nao" || (jaDisse === "nao" && !feito)) {
    return (
      <section aria-live="polite" className="rounded-lg border border-line bg-surface-200 p-6 shadow-card">
        <MailX aria-hidden className="size-7 text-ink-muted" />
        <h1 className="mt-3 text-h2">Pronto</h1>
        <p className="mt-2 text-body">Não mandamos mais e-mails como este para vocês.</p>
        <p className="mt-2 text-body-sm text-ink-muted">
          Mudou de ideia? Toque abaixo e publicamos as vagas da {empresa}.
        </p>
        <div className="mt-5">
          <Botao variante="secundario" disabled={pendente} onClick={() => responder("sim")}>
            {pendente ? "Gravando…" : "Sim, podem publicar"}
          </Botao>
        </div>
      </section>
    );
  }

  if (sair) {
    return (
      <section className="rounded-lg border border-line bg-surface-200 p-6 shadow-card">
        <MailX aria-hidden className="size-7 text-terra-text" />
        <h1 className="mt-3 text-h2">Parar de receber?</h1>
        <p className="mt-2 text-body">Não mandamos mais e-mails do Publike para a {empresa}.</p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Botao variante="primario" disabled={pendente} onClick={() => responder("nao")}>
            {pendente ? "Gravando…" : "Não quero receber"}
          </Botao>
        </div>
        {erro && (
          <p role="alert" className="mt-3 text-body-sm text-danger">
            {erro}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-6 shadow-card">
      <div>
        <h1 className="text-h2">Publicar as vagas da {empresa} no Publike</h1>
        <p className="mt-2 text-body">
          De graça, para quem mora perto. Vocês não precisam fazer nada: a equipe do Publike publica e avisa por e-mail.
        </p>
      </div>
      <Campo
        rotulo="Onde estão as vagas de vocês"
        nome="link-vagas"
        opcional
        ajuda="O link da página de vagas na Gupy ou em outro site. Sem link, chamamos vocês para combinar."
      >
        <input
          id="link-vagas"
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://suaempresa.gupy.io"
          className={classesEntrada}
        />
      </Campo>
      <Campo rotulo="WhatsApp ou telefone para falar com vocês" nome="telefone-vagas" opcional>
        <input
          id="telefone-vagas"
          type="tel"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          className={classesEntrada}
        />
      </Campo>
      <Campo rotulo="Algum recado" nome="recado-vagas" opcional>
        <textarea
          id="recado-vagas"
          rows={3}
          maxLength={500}
          value={recado}
          onChange={(e) => setRecado(e.target.value)}
          className={classesEntrada}
        />
      </Campo>
      <div className="flex flex-wrap items-center gap-3">
        <Botao variante="primario" disabled={pendente} onClick={() => responder("sim")}>
          {pendente ? "Gravando…" : "Sim, podem publicar"}
        </Botao>
        <Botao variante="fantasma" disabled={pendente} onClick={() => responder("nao")}>
          Não quero receber
        </Botao>
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}
