"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { apagarTesteDaCasa, salvarTesteDaCasa } from "@/lib/acoes/testes";
import { MAX_QUESTOES, type QuestaoTeste } from "@/lib/testes";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

const vazia = (n: number): QuestaoTeste => ({
  id: `q${n}`,
  enunciado: "",
  opcoes: [
    { id: "a", texto: "", pontos: 1 },
    { id: "b", texto: "", pontos: 0 },
    { id: "c", texto: "", pontos: 0 },
  ],
});

/** O teste da casa: nome, questões e as respostas, com a certa marcada. */
export function EditorDeTeste({
  id,
  inicial,
  vaga = null,
}: {
  id: string | null;
  inicial?: { titulo: string; descricao: string | null; questoes: QuestaoTeste[] };
  /** veio dos testes desta vaga: o teste novo volta para lá já escolhido */
  vaga?: string | null;
}) {
  const router = useRouter();
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [descricao, setDescricao] = useState(inicial?.descricao ?? "");
  const [questoes, setQuestoes] = useState<QuestaoTeste[]>(inicial?.questoes.length ? inicial.questoes : [vazia(1)]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [confirmar, setConfirmar] = useState(false);

  const mudarQuestao = (i: number, q: Partial<QuestaoTeste>) =>
    setQuestoes((l) => l.map((x, n) => (n === i ? { ...x, ...q } : x)));

  function salvar() {
    setAviso(null);
    iniciar(async () => {
      const r = await chamarAcao(() => salvarTesteDaCasa(id, titulo, descricao, questoes));
      if (!r.ok) {
        setErros("erros" in r && r.erros ? r.erros : {});
        return setAviso({ ok: false, texto: r.erro });
      }
      setErros({});
      setAviso({ ok: true, texto: r.mensagem });
      if (!id) router.push(vaga ? `/painel/anuncio/${vaga}/testes?novo=${r.id}` : `/painel/testes/${r.id}`);
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="teste-titulo" className="text-label">
          Nome do teste
        </label>
        <input
          id="teste-titulo"
          value={titulo}
          maxLength={90}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex.: Conhecimentos de padaria"
          aria-invalid={Boolean(erros.titulo)}
          className={classesEntrada}
        />
        {erros.titulo && <p className="text-body-sm text-danger">{erros.titulo}</p>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="teste-descricao" className="text-label">
          Para o candidato (opcional)
        </label>
        <input
          id="teste-descricao"
          value={descricao}
          maxLength={240}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex.: Perguntas sobre o dia a dia da padaria."
          className={classesEntrada}
        />
      </div>

      <ol className="flex flex-col gap-4">
        {questoes.map((q, i) => {
          const k = `q${i + 1}`;
          return (
            <li key={i} className="rounded-lg border border-line bg-surface-200 p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <label htmlFor={`questao-${i}`} className="text-label">
                    Questão {i + 1}
                  </label>
                  <textarea
                    id={`questao-${i}`}
                    rows={2}
                    maxLength={300}
                    value={q.enunciado}
                    onChange={(e) => mudarQuestao(i, { enunciado: e.target.value })}
                    aria-invalid={Boolean(erros[k])}
                    className={`${classesEntrada} mt-1`}
                  />
                </div>
                {questoes.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Tirar a questão ${i + 1}`}
                    onClick={() => setQuestoes((l) => l.filter((_, n) => n !== i))}
                    className="mt-6 inline-flex size-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
                  >
                    <Trash2 aria-hidden className="size-[18px]" />
                  </button>
                )}
              </div>
              <fieldset className="mt-3 flex flex-col gap-2">
                <legend className="mb-1 text-body-sm text-ink-muted">Respostas: marque a certa</legend>
                {q.opcoes.map((o, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`certa-${i}`}
                      checked={o.pontos > 0}
                      onChange={() =>
                        mudarQuestao(i, { opcoes: q.opcoes.map((x, n) => ({ ...x, pontos: n === j ? 1 : 0 })) })
                      }
                      aria-label={`Resposta ${j + 1} é a certa`}
                      className="size-5 shrink-0 accent-[var(--pk-ink)]"
                    />
                    <input
                      value={o.texto}
                      maxLength={200}
                      onChange={(e) =>
                        mudarQuestao(i, {
                          opcoes: q.opcoes.map((x, n) => (n === j ? { ...x, texto: e.target.value } : x)),
                        })
                      }
                      aria-label={`Resposta ${j + 1} da questão ${i + 1}`}
                      className={`${classesEntrada} min-h-10 py-1.5`}
                    />
                  </div>
                ))}
                {q.opcoes.length < 5 && (
                  <button
                    type="button"
                    onClick={() =>
                      mudarQuestao(i, { opcoes: [...q.opcoes, { id: "abcde"[q.opcoes.length], texto: "", pontos: 0 }] })
                    }
                    className="self-start text-body-sm text-ink-muted underline"
                  >
                    Mais uma resposta
                  </button>
                )}
              </fieldset>
              {erros[k] && <p className="mt-2 text-body-sm text-danger">{erros[k]}</p>}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {questoes.length < MAX_QUESTOES && (
          <Botao variante="fantasma" tamanho="sm" onClick={() => setQuestoes((l) => [...l, vazia(l.length + 1)])}>
            <Plus aria-hidden />
            Adicionar questão
          </Botao>
        )}
        <Botao variante="primario" disabled={pendente} onClick={salvar}>
          {pendente ? "Salvando…" : "Salvar teste"}
        </Botao>
        {id && (
          <Botao
            variante="perigo"
            tamanho="sm"
            disabled={pendente}
            onClick={() =>
              confirmar
                ? iniciar(async () => {
                    const r = await chamarAcao(() => apagarTesteDaCasa(id));
                    if (r.ok) router.push(vaga ? `/painel/testes?vaga=${vaga}` : "/painel/testes");
                    else setAviso({ ok: false, texto: r.erro });
                  })
                : setConfirmar(true)
            }
          >
            {confirmar ? "Toque de novo para apagar" : "Apagar teste"}
          </Botao>
        )}
      </div>
      {aviso && (
        <p role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
          {aviso.texto}
        </p>
      )}
      <p className="text-body-sm text-ink-muted">
        Pergunte sobre o trabalho. Idade, família, saúde, religião e aparência não podem entrar no teste.
      </p>
    </div>
  );
}
