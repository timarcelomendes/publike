"use client";

import { ClipboardList, Plus, X } from "lucide-react";
import { useState } from "react";
import { salvarTestesDaVaga } from "@/lib/acoes/testes";
import { MAX_TESTES_NA_VAGA } from "@/lib/testes";
import { Selo } from "../ui/basicos";
import { Botao, BotaoLink } from "../ui/botao";
import { Seletor, classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

type Modelo = { id: string; titulo: string; questoes: number; da_casa: boolean; tipo: string };

/**
 * Os testes da vaga (até 3): escolher da biblioteca e dizer se é opcional ou obrigatório. Sem o recurso, 1 teste
 * da Publike, grátis (`gratis`, migração 20261224120000). Vaga sem teste: o sugerido para a função, a um clique.
 */
export function TestesDaVaga({
  anuncioId,
  biblioteca,
  iniciais,
  novo = null,
  sugerido = null,
  gratis = false,
}: {
  anuncioId: string;
  biblioteca: Modelo[];
  iniciais: { modelo_id: string; obrigatoria: boolean }[];
  /** o teste que a empresa acabou de criar pela vaga: já vem escolhido */
  novo?: string | null;
  /** o teste da Publike que combina com a função da vaga */
  sugerido?: Modelo | null;
  /** sem o recurso: 1 teste da Publike por vaga, grátis */
  gratis?: boolean;
}) {
  const limite = gratis ? 1 : MAX_TESTES_NA_VAGA;
  const { rodar, pendente, mensagem } = useAcao();
  const [itens, setItens] = useState(iniciais);
  const [escolha, setEscolha] = useState(() =>
    novo && biblioteca.some((m) => m.id === novo) && !iniciais.some((i) => i.modelo_id === novo) ? novo : "",
  );
  const [mudou, setMudou] = useState(false);
  const nome = (id: string) => biblioteca.find((m) => m.id === id);
  const livres = biblioteca.filter((m) => !itens.some((i) => i.modelo_id === m.id));

  // nenhum teste para escolher (os da Publike em revisão e nenhum da casa): o caminho é criar um
  if (!biblioteca.length && !itens.length) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-body-sm text-ink-muted">
          Ainda não há testes para escolher: os da Publike estão em revisão e aparecem aqui em breve. Enquanto isso,
          crie um teste com as perguntas da sua empresa.
        </p>
        <BotaoLink href={`/painel/testes/novo?vaga=${anuncioId}`} tamanho="sm">
          <ClipboardList aria-hidden />
          Criar um teste da sua empresa
        </BotaoLink>
      </div>
    );
  }

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
                    · {m?.questoes ?? "?"} {m?.questoes === 1 ? "questão" : "questões"}
                    {m?.da_casa ? " · da casa" : ""}
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
      {itens.length === 0 && sugerido && (
        <div className="flex flex-col items-start gap-2 rounded-md border border-terra/40 bg-terra-soft p-3">
          <p className="flex flex-wrap items-center gap-2 text-label">
            Sugerido para esta vaga
            <Selo variante="novo">Novo</Selo>
          </p>
          <p className="text-body-sm">
            {sugerido.titulo}
            <span className="text-ink-muted">
              {" "}
              · {sugerido.questoes} questões{gratis ? " · grátis" : ""}
            </span>
          </p>
          <Botao
            tamanho="sm"
            variante="primario"
            disabled={pendente}
            onClick={() => {
              const novos = [{ modelo_id: sugerido.id, obrigatoria: false }];
              rodar(
                () => salvarTestesDaVaga(anuncioId, novos),
                (r) => {
                  if (r.ok) {
                    setItens(novos);
                    setMudou(false);
                  }
                },
              );
            }}
          >
            <Plus aria-hidden />
            Pôr na vaga
          </Botao>
        </div>
      )}
      {itens.length < limite && livres.length > 0 && (
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
      {gratis && itens.length >= limite && (
        <p className="text-body-sm text-ink-muted">
          Sem assinar, a vaga tem 1 teste da Publike, grátis. Mais testes e os da sua empresa vêm com o Teste Prático.
        </p>
      )}
      <p className="text-body-sm text-ink-muted">
        Quem curtir a vaga vê os testes e faz pelo celular. Obrigatório não recusa ninguém: mostra que a empresa pede o
        teste, e o candidato aparece como “falta o teste” até fazer.
      </p>
    </div>
  );
}
