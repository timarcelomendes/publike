"use client";

import { Plus, Save, Sparkles, X } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarConfigVideo, sugerirPerguntasComIA } from "@/lib/acoes/entrevista-video";
import {
  MAX_PERGUNTAS,
  MIN_PERGUNTAS,
  PRAZOS_PARA_RESPONDER,
  TEMPOS_RESPOSTA,
  textoDoTempo,
  type ConfigVideo,
} from "@/lib/entrevista-video";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";

/** As perguntas da entrevista em vídeo da vaga e as regras (o tempo, a segunda chance, o texto, pedir a todos). */
export function FormPerguntasVideo({
  anuncioId,
  config,
  sugestoes,
  ia = false,
}: {
  anuncioId: string;
  config: ConfigVideo;
  sugestoes: string[];
  /** a IA está ligada no site: aparece "Sugerir com a IA" */
  ia?: boolean;
}) {
  const [perguntas, setPerguntas] = useState<string[]>(() =>
    config.perguntas.length ? config.perguntas.map((p) => p.texto) : sugestoes.slice(0, 3),
  );
  const [segundos, setSegundos] = useState(String(config.segundos));
  const [dias, setDias] = useState(String(config.dias));
  const [segundaChance, setSegundaChance] = useState(config.segunda_chance);
  const [aceitaTexto, setAceitaTexto] = useState(config.aceita_texto);
  const [pedirATodos, setPedirATodos] = useState(config.pedir_a_todos);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  // as sugestões da IA para esta vaga, quando pedidas (nada é salvo até tocar em Salvar)
  const [daIA, setDaIA] = useState<string[] | null>(null);
  const [erroIA, setErroIA] = useState<string | null>(null);
  const [pensando, pensar] = useTransition();
  const restantes = (daIA ?? sugestoes).filter((s) => !perguntas.includes(s));
  const novo = !config.perguntas.length;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        setAviso(null);
        iniciar(async () => {
          const r = await chamarAcao(() =>
            salvarConfigVideo(anuncioId, {
              perguntas,
              segundos: Number(segundos),
              segunda_chance: segundaChance,
              aceita_texto: aceitaTexto,
              pedir_a_todos: pedirATodos,
              dias: Number(dias),
            }),
          );
          setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
        });
      }}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-label">
          Perguntas{" "}
          <span className="font-normal text-ink-muted">
            (de {MIN_PERGUNTAS} a {MAX_PERGUNTAS})
          </span>
        </legend>
        {novo && (
          <p className="text-body-sm text-ink-muted">Começamos com 3 sugestões para a vaga. Troque à vontade.</p>
        )}
        <ol className="flex flex-col gap-2">
          {perguntas.map((p, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-3 w-5 shrink-0 text-label text-ink-muted tabular-nums">{i + 1}.</span>
              <textarea
                aria-label={`Pergunta ${i + 1}`}
                value={p}
                onChange={(e) => setPerguntas((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                rows={2}
                maxLength={300}
                className={`${classesEntrada} flex-1 resize-y`}
              />
              {perguntas.length > MIN_PERGUNTAS && (
                <button
                  type="button"
                  onClick={() => setPerguntas((l) => l.filter((_, j) => j !== i))}
                  aria-label={`Tirar a pergunta ${i + 1}`}
                  className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
                >
                  <X aria-hidden className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ol>
        {perguntas.length < MAX_PERGUNTAS && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Botao
                type="button"
                tamanho="sm"
                variante="fantasma"
                onClick={() => setPerguntas((l) => [...l, ""])}
              >
                <Plus aria-hidden />
                Escrever outra pergunta
              </Botao>
              {ia && (
                <Botao
                  type="button"
                  tamanho="sm"
                  variante="secundario"
                  disabled={pensando}
                  onClick={() => {
                    setErroIA(null);
                    pensar(async () => {
                      const r = await chamarAcao(() => sugerirPerguntasComIA(anuncioId));
                      if (r.ok && "perguntas" in r) setDaIA(r.perguntas);
                      else if (!r.ok) setErroIA(r.erro);
                    });
                  }}
                >
                  <Sparkles aria-hidden />
                  {pensando ? "Pensando nas perguntas…" : daIA ? "Sugerir outras com a IA" : "Sugerir com a IA, pela vaga"}
                </Botao>
              )}
            </div>
            {erroIA && (
              <p role="status" className="text-body-sm text-danger">
                {erroIA}
              </p>
            )}
            {restantes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-body-sm text-ink-muted">
                  {daIA ? "Sugestões da IA para esta vaga (toque para pôr na entrevista):" : "Ou toque numa sugestão:"}
                </p>
                <ul className="flex flex-wrap gap-2">
                  {restantes.slice(0, daIA ? 5 : 4).map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => setPerguntas((l) => [...l, s])}
                        className="rounded-md border border-line bg-surface-100 px-3 py-2 text-left text-body-sm hover:border-line-strong hover:bg-surface-300"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="video-segundos" className="text-label">
            Tempo de cada resposta
          </label>
          <Seletor
            id="video-segundos"
            value={segundos}
            onChange={(e) => setSegundos(e.target.value)}
            className={classesEntrada}
          >
            {TEMPOS_RESPOSTA.map((s) => (
              <option key={s} value={s}>
                Até {textoDoTempo(s)}
              </option>
            ))}
          </Seletor>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="video-dias" className="text-label">
            Prazo para gravar
          </label>
          <Seletor id="video-dias" value={dias} onChange={(e) => setDias(e.target.value)} className={classesEntrada}>
            {PRAZOS_PARA_RESPONDER.map((n) => (
              <option key={n} value={n}>
                {n} dias depois do pedido
              </option>
            ))}
          </Seletor>
          <p className="text-body-sm text-ink-muted">
            Vale para os próximos pedidos. Quem já recebeu fica com o prazo de antes.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Caixa marcada={segundaChance} mudar={setSegundaChance} rotulo="Deixar gravar cada resposta de novo, uma vez" />
        <Caixa
          marcada={aceitaTexto || config.pcd}
          mudar={setAceitaTexto}
          desligada={config.pcd}
          rotulo="Aceitar a resposta por escrito de quem não pode gravar"
          ajuda={config.pcd ? "Vaga exclusiva para PCD: a resposta por escrito fica sempre ligada." : undefined}
        />
        <Caixa
          marcada={pedirATodos}
          mudar={setPedirATodos}
          rotulo="Pedir a entrevista em vídeo a todo novo candidato"
          ajuda="Quem curtir a vaga recebe o pedido na hora. Quem já se candidatou, peça pelo quadro."
        />
      </div>

      {aviso && (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}
        >
          {aviso.texto}
        </p>
      )}
      <Botao type="submit" variante="primario" disabled={pendente} className="self-start">
        <Save aria-hidden />
        {pendente ? "Salvando…" : "Salvar as perguntas"}
      </Botao>
    </form>
  );
}

function Caixa({
  marcada,
  mudar,
  rotulo,
  ajuda,
  desligada = false,
}: {
  marcada: boolean;
  mudar: (v: boolean) => void;
  rotulo: string;
  ajuda?: string;
  desligada?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-label">
        <input
          type="checkbox"
          checked={marcada}
          disabled={desligada}
          onChange={(e) => mudar(e.target.checked)}
          className="size-5 accent-[var(--pk-ink)]"
        />
        {rotulo}
      </label>
      {ajuda && <p className="pl-7 text-body-sm text-ink-muted">{ajuda}</p>}
    </div>
  );
}
