"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { salvarTestesDaVaga } from "@/lib/acoes/testes";
import { MAX_TESTES_NA_VAGA } from "@/lib/testes";
import { Botao } from "../ui/botao";
import { Seletor, classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

type Modelo = { id: string; titulo: string; questoes: number; da_casa: boolean; tipo: string };

/** Os testes da vaga (até 3): escolher da biblioteca e dizer se é opcional ou obrigatório. */
export function TestesDaVaga({
  anuncioId,
  biblioteca,
  iniciais,
}: {
  anuncioId: string;
  biblioteca: Modelo[];
  iniciais: { modelo_id: string; obrigatoria: boolean }[];
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const [itens, setItens] = useState(iniciais);
  const [escolha, setEscolha] = useState("");
  const [mudou, setMudou] = useState(false);
  const nome = (id: string) => biblioteca.find((m) => m.id === id);
  const livres = biblioteca.filter((m) => !itens.some((i) => i.modelo_id === m.id));

  return (
    <div className="flex flex-col gap-3">
      {itens.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Testes desta vaga">
          {itens.map((i) => {
            const m = nome(i.modelo_id);
            return (
              <li
                key={i.modelo_id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-surface-200 px-3 py-2"
              >
                <span className="min-w-0 flex-1 text-label">
                  {m?.titulo ?? "Teste"}
                  <span className="font-normal text-ink-muted">
                    {" "}
                    · {m?.questoes ?? "?"} questões{m?.da_casa ? " · da casa" : ""}
                  </span>
                </span>
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-body-sm">
                  <input
                    type="checkbox"
                    checked={i.obrigatoria}
                    onChange={(e) => {
                      setItens((l) =>
                        l.map((x) => (x.modelo_id === i.modelo_id ? { ...x, obrigatoria: e.target.checked } : x)),
                      );
                      setMudou(true);
                    }}
                    className="size-4 accent-[var(--pk-ink)]"
                  />
                  Obrigatório
                </label>
                <button
                  type="button"
                  aria-label={`Tirar ${m?.titulo ?? "o teste"}`}
                  onClick={() => {
                    setItens((l) => l.filter((x) => x.modelo_id !== i.modelo_id));
                    setMudou(true);
                  }}
                  className="inline-flex size-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
                >
                  <X aria-hidden className="size-[18px]" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-body-sm text-ink-muted">A vaga ainda não tem teste.</p>
      )}
      {itens.length < MAX_TESTES_NA_VAGA && livres.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="escolher-teste" className="sr-only">
            Escolher um teste
          </label>
          <Seletor
            id="escolher-teste"
            value={escolha}
            onChange={(e) => setEscolha(e.target.value)}
            className={classesEntrada}
            envoltorio="min-w-0 flex-1 sm:max-w-md"
          >
            <option value="">Escolha um teste…</option>
            {livres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.titulo}
                {m.da_casa ? " (da casa)" : ""}
              </option>
            ))}
          </Seletor>
          <Botao
            tamanho="sm"
            disabled={!escolha}
            onClick={() => {
              setItens((l) => [...l, { modelo_id: escolha, obrigatoria: false }]);
              setEscolha("");
              setMudou(true);
            }}
          >
            <Plus aria-hidden />
            Pôr na vaga
          </Botao>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Botao
          variante="primario"
          tamanho="sm"
          disabled={pendente || !mudou}
          onClick={() =>
            rodar(
              () => salvarTestesDaVaga(anuncioId, itens),
              (r) => r.ok && setMudou(false),
            )
          }
        >
          {pendente ? "Salvando…" : "Salvar testes da vaga"}
        </Botao>
        {mensagem}
      </div>
      <p className="text-body-sm text-ink-muted">
        Quem curtir a vaga vê os testes e faz pelo celular. Obrigatório não recusa ninguém: mostra que a empresa pede o
        teste, e o candidato aparece como “falta o teste” até fazer.
      </p>
    </div>
  );
}
