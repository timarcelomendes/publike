"use client";

import { Save } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarAutomacoes } from "@/lib/acoes/automacoes";
import { ETAPAS_COM_MENSAGEM, type Automacoes, type EtapaComMensagem } from "@/lib/automacoes";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";

function Regra({
  titulo,
  ajuda,
  ligada,
  mudar,
  desligada,
  children,
}: {
  titulo: string;
  ajuda: string;
  ligada: boolean;
  mudar: (v: boolean) => void;
  /** a regra não tem como valer nesta vaga (e por quê) */
  desligada?: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={ligada}
          disabled={Boolean(desligada) && !ligada}
          onChange={(e) => mudar(e.target.checked)}
          className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-label">{titulo}</span>
          <span className="text-body-sm text-ink-muted">{desligada ?? ajuda}</span>
        </span>
      </label>
      {ligada && children && <div className="ml-8">{children}</div>}
    </li>
  );
}

/** As regras da vaga: cada uma ligada com um toque. */
export function EditorAutomacoes({
  anuncioId,
  inicial,
  modelos,
}: {
  anuncioId: string;
  inicial: Automacoes;
  modelos: { id: string; nome: string }[];
}) {
  const [dispensar, setDispensar] = useState(inicial.dispensarEliminados);
  const [mensagens, setMensagens] = useState(inicial.mensagens);
  const [comMensagem, setComMensagem] = useState(Object.keys(inicial.mensagens).length > 0);
  const [parado, setParado] = useState(inicial.paradoDias);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  function salvar() {
    setAviso(null);
    iniciar(async () => {
      const r = await chamarAcao(() =>
        salvarAutomacoes(anuncioId, {
          dispensarEliminados: dispensar,
          mensagens: comMensagem ? mensagens : {},
          paradoDias: parado,
        }),
      );
      setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col divide-y divide-line">
        <Regra
          titulo="Dispensar quem não passa nas perguntas eliminatórias"
          ajuda="Quem responder diferente do que a vaga procura vai para Não seguiu e recebe o retorno 15 minutos depois. Vale para quem se candidatar daqui em diante."
          desligada={
            inicial.temEliminatoria
              ? undefined
              : "Esta vaga não tem pergunta eliminatória. Marque uma em Editar, nas perguntas da vaga."
          }
          ligada={dispensar}
          mudar={setDispensar}
        />
        <Regra
          titulo="Mandar uma mensagem pronta ao mover"
          ajuda="Ao mover alguém com match para a etapa, a mensagem vai na conversa, uma vez só por pessoa."
          desligada={
            modelos.length
              ? undefined
              : "Você ainda não tem mensagens prontas. Crie uma em “Mandar mensagem”, no quadro."
          }
          ligada={comMensagem}
          mudar={setComMensagem}
        >
          <div className="flex flex-col gap-2">
            {(Object.keys(ETAPAS_COM_MENSAGEM) as EtapaComMensagem[]).map((k) => (
              <div key={k} className="flex flex-wrap items-center gap-2 text-body-sm">
                <span className="w-28 text-label">{ETAPAS_COM_MENSAGEM[k]}</span>
                <Seletor
                  aria-label={`Mensagem ao mover para ${ETAPAS_COM_MENSAGEM[k]}`}
                  value={mensagens[k] ?? ""}
                  onChange={(e) => setMensagens((m) => ({ ...m, [k]: e.target.value || undefined }))}
                  className={classesEntrada}
                  envoltorio="w-64"
                >
                  <option value="">Nenhuma</option>
                  {modelos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </Seletor>
              </div>
            ))}
          </div>
        </Regra>
        <Regra
          titulo="Lembrar dos candidatos parados"
          ajuda="Quem ficar parado em Novos, Em análise ou Entrevista gera um aviso para você, uma vez por parada."
          ligada={parado !== null}
          mudar={(v) => setParado(v ? 5 : null)}
        >
          <label className="flex flex-wrap items-center gap-2 text-body-sm">
            Depois de
            <Seletor
              aria-label="Dias parado"
              value={String(parado ?? 5)}
              onChange={(e) => setParado(Number(e.target.value))}
              className={classesEntrada}
              envoltorio="w-28"
            >
              {[2, 3, 5, 7, 10, 15].map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </Seletor>
            na mesma etapa
          </label>
        </Regra>
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Botao variante="primario" tamanho="sm" disabled={pendente} onClick={salvar}>
          <Save aria-hidden />
          {pendente ? "Salvando…" : "Salvar as automações"}
        </Botao>
        {aviso && (
          <p
            role={aviso.ok ? "status" : "alert"}
            className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}
          >
            {aviso.texto}
          </p>
        )}
      </div>
      <p className="text-caption text-ink-muted">
        Para pedir a entrevista em vídeo a todo novo candidato, use a aba{" "}
        <Link href={`/painel/anuncio/${anuncioId}/video`} className="underline underline-offset-2">
          Entrevista em vídeo
        </Link>
        .
      </p>
    </div>
  );
}
