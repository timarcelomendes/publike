"use client";

import { useMemo, useState, useTransition } from "react";
import { porNaFilaEmailEmpresas, salvarEmailEmpresas, tirarDaFilaEmailEmpresas } from "@/lib/acoes/email-empresas";
import { chamarAcao } from "@/lib/acao-segura";
import { montarEmailEmpresas, type PublicoEmailEmpresas } from "@/lib/email-empresas";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada } from "../ui/campo";

type Config = {
  ligado: boolean;
  por_dia: number;
  hora_inicio: number;
  hora_fim: number;
  remetente_nome: string;
  remetente_email: string;
  assunto: string;
  texto: string;
};

function Mensagem({ r }: { r: { ok: boolean; texto: string } | null }) {
  if (!r) return null;
  return (
    <p role={r.ok ? "status" : "alert"} className={`text-body-sm ${r.ok ? "text-cerrado-text" : "text-danger"}`}>
      {r.texto}
    </p>
  );
}

/**
 * O texto, o limite por dia, o horário e a chave do envio, com a prévia do e-mail como ele chega (o botão, a
 * assinatura e o "Não quero receber" entram sozinhos).
 */
export function ConfigEmailEmpresas({ inicial, caixaPronta }: { inicial: Config; caixaPronta: boolean }) {
  const [ligado, setLigado] = useState(inicial.ligado);
  const [porDia, setPorDia] = useState(String(inicial.por_dia));
  const [inicio, setInicio] = useState(String(inicial.hora_inicio));
  const [fim, setFim] = useState(String(inicial.hora_fim));
  const [remetente, setRemetente] = useState(inicial.remetente_nome);
  const [assunto, setAssunto] = useState(inicial.assunto);
  const [texto, setTexto] = useState(inicial.texto);
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  const previa = useMemo(
    () =>
      montarEmailEmpresas(
        { assunto, texto, remetenteNome: remetente },
        { empresa: "Padaria Exemplo", token: "0".repeat(64), site: "https://publike.org" },
      ),
    [assunto, texto, remetente],
  );
  const mudou = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    setResposta(null);
  };

  function salvar() {
    iniciar(async () => {
      const r = await chamarAcao(() =>
        salvarEmailEmpresas({ ligado, porDia, horaInicio: inicio, horaFim: fim, remetenteNome: remetente, assunto, texto }),
      );
      setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface-100 p-4">
        <input
          type="checkbox"
          checked={ligado}
          onChange={(e) => mudou(setLigado)(e.target.checked)}
          className="mt-1 size-5 accent-[var(--color-ink)]"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-label">Mandar os e-mails da fila</span>
          <span className="text-body-sm text-ink-muted">
            Um por vez, espaçados no horário, de segunda a sexta.
            {!caixaPronta && " A caixa do Marcelo ainda não está ligada: nada sai até ela estar."}
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Por dia" nome="por-dia" ajuda="No máximo, somando todos os públicos.">
          <input
            id="por-dia"
            inputMode="numeric"
            value={porDia}
            onChange={(e) => mudou(setPorDia)(e.target.value)}
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Das (hora)" nome="hora-inicio">
          <input
            id="hora-inicio"
            inputMode="numeric"
            value={inicio}
            onChange={(e) => mudou(setInicio)(e.target.value)}
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Até (hora)" nome="hora-fim" ajuda="Hora de Brasília.">
          <input
            id="hora-fim"
            inputMode="numeric"
            value={fim}
            onChange={(e) => mudou(setFim)(e.target.value)}
            className={classesEntrada}
          />
        </Campo>
      </div>

      <Campo rotulo="Quem assina" nome="remetente" ajuda={`Sai de ${inicial.remetente_email}; as respostas chegam lá.`}>
        <input
          id="remetente"
          value={remetente}
          maxLength={60}
          onChange={(e) => mudou(setRemetente)(e.target.value)}
          className={classesEntrada}
        />
      </Campo>
      <Campo rotulo="Assunto" nome="assunto" ajuda="{empresa} vira o nome da empresa.">
        <input
          id="assunto"
          value={assunto}
          maxLength={150}
          onChange={(e) => mudou(setAssunto)(e.target.value)}
          className={classesEntrada}
        />
      </Campo>
      <Campo
        rotulo="Texto"
        nome="texto"
        ajuda="Uma linha em branco separa os parágrafos. O botão “Sim, podem publicar”, a assinatura e o “Não quero receber” entram sozinhos no fim."
      >
        <textarea
          id="texto"
          rows={10}
          maxLength={3000}
          value={texto}
          onChange={(e) => mudou(setTexto)(e.target.value)}
          className={classesEntrada}
        />
      </Campo>

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Como chega (para a Padaria Exemplo)</h3>
        <p className="text-body-sm">
          <span className="text-ink-muted">Assunto:</span> {previa.assunto}
        </p>
        <iframe
          title="Prévia do e-mail"
          srcDoc={previa.html}
          sandbox=""
          className="h-[30rem] w-full rounded-md border border-line bg-white"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Botao variante="primario" disabled={pendente} onClick={salvar}>
          {pendente ? "Salvando…" : "Salvar"}
        </Botao>
        <Mensagem r={resposta} />
      </div>
    </div>
  );
}

/** Pôr na fila (até N de um público) e tirar da fila os que ainda não saíram. */
export function FilaDoPublico({
  publico,
  disponiveis,
  naFila,
}: {
  publico: PublicoEmailEmpresas;
  disponiveis: number;
  naFila: number;
}) {
  const [quantos, setQuantos] = useState(String(Math.min(25, Math.max(disponiveis, 1))));
  const [pendente, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);

  const rodar = (f: () => Promise<{ ok: true; mensagem?: string } | { ok: false; erro: string }>) =>
    iniciar(async () => {
      const r = await chamarAcao(f);
      setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "Feito." } : { ok: false, texto: r.erro });
    });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`quantos-${publico}`}>
          Quantos pôr na fila
        </label>
        <span className="w-24 shrink-0">
          <input
            id={`quantos-${publico}`}
            inputMode="numeric"
            value={quantos}
            onChange={(e) => setQuantos(e.target.value)}
            disabled={!disponiveis}
            className={classesEntrada}
          />
        </span>
        <Botao
          variante="secundario"
          tamanho="sm"
          disabled={pendente || !disponiveis}
          onClick={() => rodar(() => porNaFilaEmailEmpresas(publico, Number(quantos)))}
        >
          Pôr na fila
        </Botao>
        {naFila > 0 && (
          <Botao
            variante="fantasma"
            tamanho="sm"
            disabled={pendente}
            onClick={() => rodar(() => tirarDaFilaEmailEmpresas(publico))}
          >
            Tirar da fila
          </Botao>
        )}
      </div>
      <Mensagem r={resposta} />
    </div>
  );
}
