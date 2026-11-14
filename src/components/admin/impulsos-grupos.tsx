"use client";

import { useId, useState } from "react";
import { salvarGruposAdmin } from "@/lib/acoes/admin-impulsos";
import { formatarDataHora, formatarMoeda, plural } from "@/lib/formato";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

// Admin › Impulsos › Regras › Grupos por função e cidade (claude/plano-palavras-chave-pelas-funcoes.md; migração
// 20270522120000). A chave, a verba por grupo e a entrada; a conta ao vivo (a diferença que os pacotes põem na campanha ÷
// a verba por grupo) e a lista: o que o robô liga, o que fica de fora e o que já está no Google.

const reais = (v: number) => formatarMoeda(Math.round(v * 100) / 100);

export type LinhaDoGrupo = {
  chave: string;
  tipo: "funcao" | "cidade";
  nome: string;
  pagina: string;
  vagas: number;
  impulsionadas: number;
  /** entra na conta de hoje */
  entra: boolean;
  /** no Google agora */
  situacao: "fora" | "ligado" | "pausado";
  palavras: string[];
  erro: string | null;
};

export function GruposDaGeral({
  config,
  alvo,
  base,
  linhas,
  feitaEm,
  erro,
}: {
  config: { ligados: boolean; verba: number; entrada: number };
  alvo: number;
  base: number;
  linhas: LinhaDoGrupo[];
  feitaEm: string | null;
  erro: { texto: string | null; em: string | null };
}) {
  const id = useId();
  const [c, setC] = useState(config);
  const { rodar, pendente, mensagem } = useAcao();
  const diferenca = Math.max(0, Math.round((alvo - base) * 100) / 100);
  const cabem = c.verba >= 10 ? Math.floor(diferenca / c.verba + 1e-9) : 0;
  const candidatas = linhas.filter((l) => l.impulsionadas > 0 || l.vagas >= c.entrada);
  const funcoes = linhas.filter((l) => l.tipo === "funcao");
  const cidades = linhas.filter((l) => l.tipo === "cidade");

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() => salvarGruposAdmin(c));
      }}
    >
      <label className="flex items-start gap-2 text-body">
        <input
          type="checkbox"
          checked={c.ligados}
          onChange={(e) => setC({ ...c, ligados: e.target.checked })}
          className="mt-1 size-4"
          aria-describedby={`${id}-chave`}
        />
        <span>
          Palavras pelas funções e cidades do site
          <span id={`${id}-chave`} className="block text-body-sm text-ink-muted">
            Na campanha geral, um grupo para cada função e cidade com vaga no ar, com as palavras da IA e o anúncio que leva
            à página dela. Desligada, o robô pausa todos os grupos (nada é apagado).
          </span>
        </span>
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-body-sm text-ink-muted">Verba por grupo, por dia</span>
          <span className="flex items-center gap-2">
            <span className="text-body-sm text-ink-muted">R$</span>
            <input
              type="number"
              min={10}
              max={1000}
              step="1"
              value={c.verba}
              onChange={(e) => setC({ ...c, verba: Number(e.target.value) })}
              className={`${classesEntrada} w-28`}
            />
          </span>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-body-sm text-ink-muted">Vagas no ar para entrar</span>
          <input
            type="number"
            min={1}
            max={50}
            step="1"
            value={c.entrada}
            onChange={(e) => setC({ ...c, entrada: Number(e.target.value) })}
            className={`${classesEntrada} w-28`}
          />
        </label>
      </div>
      <p className="max-w-3xl text-body-sm text-ink-muted" aria-live="polite">
        Orçamento de agora: {reais(alvo)} por dia, com {reais(base)} de base. A diferença dos pacotes, {reais(diferenca)},
        paga {cabem === 0 ? "nenhum grupo" : `até ${plural(cabem, "grupo", "grupos")}`} de {reais(c.verba)}.{" "}
        {candidatas.length > 0 &&
          `Há ${plural(candidatas.length, "função ou cidade", "funções e cidades")} que podem entrar${
            candidatas.length > cabem ? `; ficam de fora ${candidatas.length - cabem}` : ""
          }. Entram primeiro as com vaga impulsionada, depois as com mais vagas.`}
      </p>
      <p className="text-body-sm text-ink-muted">
        {feitaEm ? `O robô acertou os grupos em ${formatarDataHora(feitaEm)}.` : "O robô ainda não acertou os grupos."}
      </p>
      {erro.texto && (
        <p className="text-body-sm break-words text-danger">
          {erro.em ? `${formatarDataHora(erro.em)}: ` : ""}
          {erro.texto}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" variante="primario" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar os grupos"}
        </Botao>
        {mensagem}
      </div>
      {[
        ["Funções", funcoes],
        ["Cidades", cidades],
      ].map(([titulo, lista]) =>
        (lista as LinhaDoGrupo[]).length ? (
          <section key={titulo as string} className="flex flex-col gap-2">
            <h4 className="text-label">{titulo as string}</h4>
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
              {(lista as LinhaDoGrupo[]).map((l) => (
                <li key={`${l.tipo}:${l.chave}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3">
                  <span className="min-w-0">
                    <span className="text-body font-semibold">{l.nome}</span>{" "}
                    <span className="text-body-sm text-ink-muted">
                      {plural(l.vagas, "vaga", "vagas")}
                      {l.impulsionadas > 0 ? `, ${plural(l.impulsionadas, "impulsionada", "impulsionadas")}` : ""}
                    </span>
                    {l.palavras.length > 0 && (
                      <span className="block text-body-sm text-ink-muted">{l.palavras.slice(0, 6).join(", ")}…</span>
                    )}
                    {l.erro && <span className="block text-body-sm break-words text-danger">{l.erro}</span>}
                  </span>
                  <span className="text-body-sm">
                    {l.situacao === "ligado"
                      ? "No Google"
                      : l.situacao === "pausado"
                        ? "Pausado"
                        : l.entra
                          ? "Entra na próxima volta"
                          : "Fora"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </form>
  );
}
