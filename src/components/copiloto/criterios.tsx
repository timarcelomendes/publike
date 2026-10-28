"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarCriterios, sugerirCriteriosComIA } from "@/lib/acoes/copiloto";
import { MAX_CRITERIOS, motivoProibido, type CriterioCopiloto } from "@/lib/copiloto";
import { classesEntrada } from "../ui/campo";
import { Botao } from "../ui/botao";

function novoId(lista: CriterioCopiloto[]) {
  let n = lista.length + 1;
  while (lista.some((c) => c.id === `c${n}`)) n++;
  return `c${n}`;
}

/** Os critérios da vaga: a IA sugere, a pessoa ajusta e salva. */
export function EditorDeCriterios({ anuncioId, iniciais }: { anuncioId: string; iniciais: CriterioCopiloto[] }) {
  const [lista, setLista] = useState<CriterioCopiloto[]>(
    iniciais.length ? iniciais : [{ id: "c1", texto: "", obrigatorio: true }],
  );
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [mudou, setMudou] = useState(false);
  const [sugerindo, iniciarSugestao] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();

  function mudar(id: string, parte: Partial<CriterioCopiloto>) {
    setLista((l) => l.map((c) => (c.id === id ? { ...c, ...parte } : c)));
    setMudou(true);
    if (parte.texto !== undefined) {
      const motivo = motivoProibido(parte.texto);
      setErros((e) => {
        const resto = { ...e };
        delete resto[id];
        return motivo ? { ...resto, [id]: motivo } : resto;
      });
    }
  }

  function sugerir() {
    setAviso(null);
    iniciarSugestao(async () => {
      const r = await chamarAcao(() => sugerirCriteriosComIA(anuncioId));
      if (!r.ok) return setAviso({ ok: false, texto: r.erro });
      setLista(r.criterios);
      setErros({});
      setMudou(true);
      setAviso({ ok: true, texto: "A IA sugeriu estes critérios. Ajuste o que quiser e salve." });
    });
  }

  function salvar() {
    setAviso(null);
    iniciarSalvar(async () => {
      const r = await chamarAcao(() =>
        salvarCriterios(
          anuncioId,
          lista.filter((c) => c.texto.trim()),
        ),
      );
      if (!r.ok) {
        setErros("erros" in r && r.erros ? r.erros : {});
        return setAviso({ ok: false, texto: r.erro });
      }
      setMudou(false);
      setAviso({ ok: true, texto: r.mensagem });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2" aria-label="Critérios da vaga">
        {lista.map((c, i) => (
          <li key={c.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <label className="sr-only" htmlFor={`criterio-${c.id}`}>
                Critério {i + 1}
              </label>
              <input
                id={`criterio-${c.id}`}
                value={c.texto}
                maxLength={120}
                placeholder="Ex.: Experiência como auxiliar de cozinha"
                aria-invalid={Boolean(erros[c.id])}
                aria-describedby={erros[c.id] ? `erro-${c.id}` : undefined}
                onChange={(e) => mudar(c.id, { texto: e.target.value })}
                className={`${classesEntrada} min-w-0 flex-1 basis-full sm:basis-auto`}
              />
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-body-sm">
                <input
                  type="checkbox"
                  checked={c.obrigatorio}
                  onChange={(e) => mudar(c.id, { obrigatorio: e.target.checked })}
                  className="size-4 accent-[var(--pk-ink)]"
                />
                Obrigatório
              </label>
              <button
                type="button"
                onClick={() => {
                  setLista((l) => l.filter((x) => x.id !== c.id));
                  setMudou(true);
                }}
                aria-label={`Tirar o critério ${i + 1}`}
                className="inline-flex size-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
              >
                <Trash2 aria-hidden className="size-[18px]" />
              </button>
            </div>
            {erros[c.id] && (
              <p id={`erro-${c.id}`} className="text-body-sm text-danger">
                {erros[c.id]}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {lista.length < MAX_CRITERIOS && (
          <Botao
            tamanho="sm"
            variante="fantasma"
            onClick={() => setLista((l) => [...l, { id: novoId(l), texto: "", obrigatorio: false }])}
          >
            <Plus aria-hidden />
            Adicionar critério
          </Botao>
        )}
        <Botao tamanho="sm" onClick={sugerir} disabled={sugerindo || salvando}>
          <Sparkles aria-hidden />
          {sugerindo ? "Sugerindo…" : "Sugerir com a IA"}
        </Botao>
        <Botao tamanho="sm" variante="primario" onClick={salvar} disabled={salvando || sugerindo || !mudou}>
          {salvando ? "Salvando…" : "Salvar critérios"}
        </Botao>
      </div>
      {aviso && (
        <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
          {aviso.texto}
        </p>
      )}
      <p className="text-body-sm text-ink-muted">
        Idade, sexo, foto, estado civil, deficiência e endereço não entram: a IA não lê isso, e a lei não deixa escolher
        por isso.
      </p>
    </div>
  );
}
