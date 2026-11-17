"use client";

import { X } from "lucide-react";
import { useId, useState, useTransition, type FormEvent } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { buscarCep } from "@/lib/acoes/cep";
import { esquecerLocal, salvarLocal } from "@/lib/acoes/local";
import { formatarCep, limparCep } from "@/lib/cep";
import { BAIRROS } from "@/lib/bairros";
import { CIDADES, type Cidade } from "@/lib/constantes";
import type { Local } from "@/lib/regioes";
import { classesBotao } from "../ui/botao";
import { classesEntrada, MensagemErro, Seletor } from "../ui/campo";
import { PRACA_PADRAO } from "@/lib/pracas";

// O painel "Onde você mora?" (o CEP, ou a cidade e o bairro), num arquivo à parte (17/11/2026): a lista dos bairros
// (lib/bairros.ts, ~35 KB) só baixa quando o painel abre. Quem usa importa o PainelOndeMora de onde-mora.tsx, que o
// carrega sob demanda.

/**
 * Painel "Onde você mora?". O jeito mais preciso é o CEP de casa: as distâncias
 * e o tempo de ônibus saem da rua da pessoa. Sem CEP, cidade e bairro já põem
 * primeiro o que é do bairro, depois da região (nas cidades com regiões) e da cidade.
 * O CEP fica na conta (ou neste navegador) e ninguém mais vê.
 */
export function PainelOndeMora({
  id,
  local,
  cidadePadrao,
  fechar,
  aoSalvar,
}: {
  id: string;
  local: Local | null;
  /** sem lugar escolhido: a cidade de quem vê (pelo endereço de internet, ou a principal) */
  cidadePadrao?: string;
  fechar: () => void;
  /** depois de salvar (a busca passa a contar de casa) */
  aoSalvar?: () => void;
}) {
  const [cep, setCep] = useState(formatarCep(local?.cep));
  const [cepConferido, setCepConferido] = useState<string | null>(local?.cep ?? null);
  const [cidade, setCidade] = useState<string>(local?.cidade ?? cidadePadrao ?? PRACA_PADRAO.cidade);
  const [bairro, setBairro] = useState(local?.bairro ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const campo = useId();

  function conferirCep(valor: string) {
    const c = limparCep(valor);
    if (c.length !== 8 || c === cepConferido) return;
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => buscarCep(c));
      if (!r.ok) {
        setErro(r.erro);
        setCepConferido(null);
        return;
      }
      setCepConferido(c);
      if ((CIDADES as readonly string[]).includes(r.endereco.cidade)) setCidade(r.endereco.cidade);
      if (r.endereco.bairro) setBairro(r.endereco.bairro);
    });
  }

  function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => salvarLocal(cidade, bairro, limparCep(cep) || null));
      if (!r.ok) return setErro(r.erro);
      fechar();
      aoSalvar?.();
    });
  }

  function esquecer() {
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => esquecerLocal());
      if (!r.ok) return setErro(r.erro);
      fechar();
    });
  }

  return (
    <form
      id={id}
      onSubmit={salvar}
      aria-labelledby={`${campo}-titulo`}
      className="relative flex flex-col gap-4 rounded-lg border border-line-strong bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <button
        type="button"
        onClick={fechar}
        className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300"
      >
        <X aria-hidden className="size-4" />
        <span className="sr-only">Fechar</span>
      </button>
      <div className="pr-10">
        <h2 id={`${campo}-titulo`} className="text-label">
          Onde você mora?
        </h2>
        <p className="mt-0.5 text-body-sm text-ink-muted">
          Com o CEP de casa, mostramos a distância e o tempo de ônibus até cada vaga. Ninguém vê o seu CEP.
          {local?.fonte === "perfil" && " Agora estamos usando o bairro do seu perfil."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,9rem)_minmax(0,2fr)_minmax(0,3fr)_auto] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${campo}-cep`} className="text-label">
            CEP de casa <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <input
            id={`${campo}-cep`}
            value={cep}
            onChange={(e) => {
              const novo = formatarCep(e.target.value);
              setCep(novo);
              // confere assim que completa os 8 números
              conferirCep(novo);
            }}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="74000-000"
            maxLength={9}
            className={classesEntrada}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${campo}-cidade`} className="text-label">
            Cidade
          </label>
          <Seletor
            id={`${campo}-cidade`}
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className={classesEntrada}
          >
            {CIDADES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Seletor>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${campo}-bairro`} className="text-label">
            Bairro <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <input
            id={`${campo}-bairro`}
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            list={`${campo}-bairros`}
            maxLength={60}
            autoComplete="off"
            placeholder="Comece a digitar"
            className={classesEntrada}
          />
          <datalist id={`${campo}-bairros`}>
            {(BAIRROS[cidade as Cidade] ?? []).map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
        <button type="submit" disabled={pendente} className={classesBotao("primario", "md")}>
          {pendente ? "Salvando…" : "Salvar"}
        </button>
      </div>

      {erro && <MensagemErro>{erro}</MensagemErro>}

      {(local?.fonte === "busca" || local?.fonte === "casa") && (
        <button
          type="button"
          onClick={esquecer}
          disabled={pendente}
          className="self-start text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Esquecer onde moro
        </button>
      )}
    </form>
  );
}
