"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Botao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { useAcao } from "@/components/ui/usar-acao";
import { salvarTiposDeVaga, type TipoDeVaga } from "@/lib/acoes/admin-impulsos";
import { plural } from "@/lib/formato";

// Admin › Impulsos › Regras › Tipos de vaga (migração 20270430120000): o nome, as palavras do título que põem a vaga
// no tipo, as que tiram, e as regras do tipo (dias e verba de partida do impulso pelo admin e do automático; o raio vale
// para todo impulso). A vaga fica no primeiro tipo da lista que combina: a ordem importa.

type Linha = {
  chave: string;
  id: string | null;
  nome: string;
  palavras: string;
  menos: string;
  dias: string;
  verba: string;
  raio: string;
  vagas?: number;
};

const lista = (texto: string) =>
  texto
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

const numeroOuNulo = (texto: string) => {
  const t = texto.trim().replace(",", ".");
  return t ? Number(t) : null;
};

let proxima = 0;
const novaChave = () => `novo-${++proxima}`;

function paraLinha(t: TipoDeVaga): Linha {
  return {
    chave: t.id ?? novaChave(),
    id: t.id,
    nome: t.nome,
    palavras: t.palavras.join(", "),
    menos: t.menos.join(", "),
    dias: t.dias?.toString() ?? "",
    verba: t.verba?.toString().replace(".", ",") ?? "",
    raio: t.raio?.toString() ?? "",
    vagas: t.vagas,
  };
}

function Numero({
  rotulo,
  valor,
  mudar,
  unidade,
}: {
  rotulo: string;
  valor: string;
  mudar: (v: string) => void;
  unidade?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-body-sm text-ink-muted">{rotulo}</span>
      <span className="flex items-center gap-1.5">
        {unidade === "R$" && <span className="text-body-sm text-ink-muted">R$</span>}
        <input
          inputMode="decimal"
          value={valor}
          placeholder="geral"
          onChange={(e) => mudar(e.target.value.replace(/[^\d,.]/g, "").slice(0, 7))}
          className={`${classesEntrada.replace("w-full", "w-20")} placeholder:text-ink-muted/60`}
        />
        {unidade === "km" && <span className="text-body-sm text-ink-muted">km</span>}
      </span>
    </label>
  );
}

export function TiposDeVaga({ tipos, outros }: { tipos: TipoDeVaga[]; outros: number }) {
  const [linhas, setLinhas] = useState<Linha[]>(() => tipos.map(paraLinha));
  const { rodar, pendente, mensagem } = useAcao();

  const mudar = (chave: string, campo: Partial<Linha>) =>
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...campo } : l)));
  const mover = (i: number, para: number) =>
    setLinhas((atual) => {
      const nova = [...atual];
      const [l] = nova.splice(i, 1);
      nova.splice(para, 0, l);
      return nova;
    });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        rodar(() =>
          salvarTiposDeVaga(
            linhas.map((l) => ({
              id: l.id,
              nome: l.nome,
              palavras: lista(l.palavras),
              menos: lista(l.menos),
              dias: numeroOuNulo(l.dias),
              verba: numeroOuNulo(l.verba),
              raio: numeroOuNulo(l.raio),
            })),
          ),
        );
      }}
    >
      <ol className="flex flex-col gap-3">
        {linhas.map((l, i) => (
          <li key={l.chave}>
            <fieldset className="flex flex-col gap-3 rounded-md border border-line p-4">
              <legend className="sr-only">Tipo {i + 1}</legend>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex w-full flex-col gap-1 sm:w-52">
                  <span className="text-body-sm text-ink-muted">Nome</span>
                  <input
                    value={l.nome}
                    maxLength={40}
                    onChange={(e) => mudar(l.chave, { nome: e.target.value })}
                    className={`${classesEntrada} font-semibold`}
                  />
                </label>
                <Numero rotulo="Dias" valor={l.dias} mudar={(v) => mudar(l.chave, { dias: v })} />
                <Numero rotulo="Verba por vaga" valor={l.verba} mudar={(v) => mudar(l.chave, { verba: v })} unidade="R$" />
                <Numero rotulo="Raio" valor={l.raio} mudar={(v) => mudar(l.chave, { raio: v })} unidade="km" />
                <div className="flex gap-1 sm:ml-auto">
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    aria-label={`Subir ${l.nome || "o tipo"}`}
                    disabled={i === 0}
                    onClick={() => mover(i, i - 1)}
                  >
                    <ArrowUp aria-hidden />
                  </Botao>
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    aria-label={`Descer ${l.nome || "o tipo"}`}
                    disabled={i === linhas.length - 1}
                    onClick={() => mover(i, i + 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Botao>
                  <Botao
                    tamanho="sm"
                    variante="fantasma"
                    aria-label={`Tirar ${l.nome || "o tipo"}`}
                    onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
                  >
                    <Trash2 aria-hidden />
                  </Botao>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-body-sm text-ink-muted">Palavras do título, separadas por vírgula</span>
                  <input
                    value={l.palavras}
                    onChange={(e) => mudar(l.chave, { palavras: e.target.value })}
                    placeholder="fiscal, tributar, imposto"
                    className={classesEntrada}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-body-sm text-ink-muted">Menos quando o título tiver</span>
                  <input
                    value={l.menos}
                    onChange={(e) => mudar(l.chave, { menos: e.target.value })}
                    placeholder="Nenhuma"
                    className={classesEntrada}
                  />
                </label>
              </div>
              {l.vagas !== undefined && (
                <p className="text-body-sm text-ink-muted">Pega {plural(l.vagas, "vaga no ar", "vagas no ar")} agora.</p>
              )}
            </fieldset>
          </li>
        ))}
      </ol>
      <p className="text-body-sm text-ink-muted">
        {outros > 0
          ? `${plural(outros, "vaga no ar não entra", "vagas no ar não entram")} em nenhum tipo e ${outros === 1 ? "fica" : "ficam"} em Outros.`
          : "Todas as vagas no ar entram em algum tipo."}{" "}
        A contagem muda depois de salvar.
      </p>
      <div className="flex flex-wrap gap-2">
        <Botao
          tamanho="sm"
          onClick={() =>
            setLinhas((atual) => [
              ...atual,
              { chave: novaChave(), id: null, nome: "", palavras: "", menos: "", dias: "", verba: "", raio: "" },
            ])
          }
        >
          <Plus aria-hidden />
          Adicionar tipo
        </Botao>
        <Botao type="submit" tamanho="sm" variante="primario" disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar os tipos"}
        </Botao>
      </div>
      {mensagem}
    </form>
  );
}
