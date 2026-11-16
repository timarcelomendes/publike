"use client";

import { LocateFixed } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { buscarEnderecoDoPonto } from "@/lib/acoes/cep";
import { BAIRROS } from "@/lib/bairros";
import type { Cidade } from "@/lib/constantes";
import { AVISOS_GPS, pedirPosicao } from "../explorar/barra-busca";
import { classesEntrada, MensagemErro } from "../ui/campo";

/**
 * O bairro onde a pessoa mora (no currículo, obrigatório desde 16/11/2026): a lista de bairros da cidade para escolher
 * enquanto digita e o "Usar minha localização", que preenche com o bairro de onde o aparelho está (a pessoa confere:
 * pode estar no trabalho). O ponto do aparelho não é guardado; só o nome do bairro.
 */
export function CampoBairro({
  cidade,
  inicial,
  erro,
  nome = "bairro",
  aoMudar,
}: {
  cidade: string;
  inicial: string;
  erro?: string;
  nome?: string;
  aoMudar?: (bairro: string) => void;
}) {
  const id = useId();
  const [bairro, setBairro] = useState(inicial);
  const [aviso, setAviso] = useState<string | null>(null);
  const [buscando, iniciar] = useTransition();
  const lista = BAIRROS[cidade as Cidade] ?? [];

  function mudar(valor: string) {
    setBairro(valor);
    aoMudar?.(valor);
  }

  function usarLocalizacao() {
    setAviso(null);
    pedirPosicao(
      (ponto) =>
        iniciar(async () => {
          const r = await buscarEnderecoDoPonto(ponto.lat, ponto.lng).catch(() => null);
          if (!r?.ok || !r.endereco.bairro) {
            setAviso("Não achamos o bairro deste lugar. Escreva o seu.");
            return;
          }
          mudar(r.endereco.bairro.slice(0, 80));
          setAviso(
            r.endereco.cidade && r.endereco.cidade !== cidade
              ? `Você está em ${r.endereco.cidade}. Se mora em ${cidade}, escreva o seu bairro.`
              : "Confira: se você não está em casa agora, troque pelo bairro onde mora.",
          );
        }),
      (motivo) => setAviso(AVISOS_GPS[motivo]),
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-label">
        Bairro onde você mora
      </label>
      <p id={`${id}-ajuda`} className="text-body-sm text-ink-muted">
        Aparece no seu cartão para as empresas verem que você mora perto. Nunca mostramos o seu endereço.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={id}
          name={nome}
          value={bairro}
          onChange={(e) => mudar(e.target.value)}
          list={`${id}-lista`}
          maxLength={80}
          required
          autoComplete="address-level3"
          placeholder={lista[0] ? `Ex.: ${lista[0]}` : "Ex.: Setor Bueno"}
          aria-invalid={erro ? true : undefined}
          aria-describedby={`${id}-ajuda`}
          className={`${classesEntrada} sm:flex-1`}
        />
        <button
          type="button"
          onClick={usarLocalizacao}
          disabled={buscando}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300 disabled:opacity-60"
        >
          <LocateFixed aria-hidden className="size-[18px]" />
          {buscando ? "Procurando…" : "Usar minha localização"}
        </button>
      </div>
      <datalist id={`${id}-lista`}>
        {lista.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      {aviso && (
        <p role="status" className="text-body-sm text-ink-muted">
          {aviso}
        </p>
      )}
      {erro && <MensagemErro>{erro}</MensagemErro>}
    </div>
  );
}
