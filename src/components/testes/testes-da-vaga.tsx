"use client";

import { ClipboardList, Clock, Plus, X } from "lucide-react";
import { useState } from "react";
import { salvarTestesDaVaga } from "@/lib/acoes/testes";
import { MAX_TESTES_NA_VAGA, minutosDoTeste, nomeCurtoDoTeste } from "@/lib/testes";
import { Aviso, Selo } from "../ui/basicos";
import { Botao, BotaoLink } from "../ui/botao";
import { Seletor, classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

type Modelo = { id: string; titulo: string; questoes: number; da_casa: boolean; tipo: string };

/** acima disso, somando os obrigatórios, muita gente desiste da vaga */
const MINUTOS_DEMAIS = 20;

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
  feitas = {},
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
  /** quantos candidatos já fizeram cada teste (pelo id do teste) */
  feitas?: Record<string, number>;
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
  const minutos = (id: string) => minutosDoTeste(nome(id)?.questoes ?? 0);
  const total = itens.reduce((t, i) => t + minutos(i.modelo_id), 0);
  const totalObrigatorio = itens.filter((i) => i.obrigatoria).reduce((t, i) => t + minutos(i.modelo_id), 0);
  const mudar = (id: string, obrigatoria: boolean) => {
    setItens((l) => l.map((x) => (x.modelo_id === id ? { ...x, obrigatoria } : x)));
    setMudou(true);
  };

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
        <>
          <p className="flex flex-wrap items-center gap-x-2 text-body-sm text-ink-muted">
            <Clock aria-hidden className="size-4" />
            {itens.length === 1 ? "1 teste" : `${itens.length} testes`}: cerca de {total} min para o candidato
            {totalObrigatorio > 0 && totalObrigatorio < total && ` (${totalObrigatorio} min obrigatórios)`}
          </p>
          <ul
            className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-100"
            aria-label="Testes desta vaga"
          >
            {itens.map((i) => {
              const m = nome(i.modelo_id);
              const fizeram = feitas[i.modelo_id] ?? 0;
              return (
                <li key={i.modelo_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 sm:px-4">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-label">{m ? nomeCurtoDoTeste(m.titulo) : "Teste"}</p>
                    <p className="text-body-sm text-ink-muted">
                      {m?.questoes ?? "?"} {m?.questoes === 1 ? "questão" : "questões"} · cerca de{" "}
                      {minutos(i.modelo_id)} min · {m?.da_casa ? "da sua empresa" : "da Publike"}
                      {fizeram > 0 && ` · ${fizeram === 1 ? "1 fez" : `${fizeram} fizeram`}`}
                    </p>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={`Como pedir ${m ? nomeCurtoDoTeste(m.titulo) : "o teste"}`}
                    className="inline-flex rounded-pill border border-line-strong bg-surface-200 p-0.5"
                  >
                    {[
                      { valor: false, nome: "Opcional" },
                      { valor: true, nome: "Obrigatório" },
                    ].map((o) => (
                      <button
                        key={o.nome}
                        type="button"
                        role="radio"
                        aria-checked={i.obrigatoria === o.valor}
                        onClick={() => i.obrigatoria !== o.valor && mudar(i.modelo_id, o.valor)}
                        className={`min-h-9 rounded-pill px-3 text-label transition-colors ${
                          i.obrigatoria === o.valor ? "bg-ink text-surface-100" : "text-ink-muted hover:text-ink"
                        }`}
                      >
                        {o.nome}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    aria-label={`Tirar ${m ? nomeCurtoDoTeste(m.titulo) : "o teste"} da vaga`}
                    title="Tirar da vaga"
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
          {totalObrigatorio > MINUTOS_DEMAIS && (
            <Aviso tipo="alerta">
              São {totalObrigatorio} min de teste obrigatório. Teste longo faz gente desistir da vaga: deixe obrigatório
              só o mais importante e os outros como opcionais.
            </Aviso>
          )}
        </>
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
      {!gratis && itens.length >= limite && (
        <p className="text-body-sm text-ink-muted">A vaga já tem {limite} testes, o máximo. Tire um para pôr outro.</p>
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
        Quem curtir a vaga faz os testes pelo celular. Obrigatório não recusa ninguém: o candidato aparece como “falta o
        teste” até fazer.
      </p>
    </div>
  );
}
