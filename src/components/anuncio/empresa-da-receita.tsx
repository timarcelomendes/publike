"use client";

import { Building2, LoaderCircle, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { acharEmpresas, funcoesDoRamo, type EmpresaAchada, type FuncaoDoRamo } from "@/lib/acoes/empresas-receita";
import { reaisDaFaixa } from "@/lib/salarios";
import { classesEntrada } from "../ui/campo";

/**
 * O primeiro campo da vaga (claude/plano-base-de-empresas-da-receita.md, parte 3): "CNPJ ou nome da sua empresa".
 * Achada na base da Receita, a empresa traz o endereço (com o ponto no mapa) e o que o ramo dela mais contrata em
 * Goiás, com a faixa de salário; um toque numa função preenche o título e o cargo na carteira. Sem achar, nada muda:
 * a pessoa segue preenchendo como sempre.
 */
export function EmpresaDaReceita({
  cidade,
  aoEscolher,
  aoEscolherFuncao,
}: {
  cidade: string;
  aoEscolher: (empresa: EmpresaAchada) => void;
  aoEscolherFuncao: (funcao: FuncaoDoRamo) => void;
}) {
  const id = useId();
  // veio do QR code da rota do currículo (/cv/<código>): o CNPJ daquele comércio já vem na busca
  const pedida = useSearchParams().get("empresa");
  const [texto, setTexto] = useState(() => (pedida && /^[0-9A-Z]{14}$/.test(pedida) ? pedida : ""));
  const [resultado, setResultado] = useState<{ texto: string; lista: EmpresaAchada[] } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [escolhida, setEscolhida] = useState<EmpresaAchada | null>(null);
  const [funcoes, setFuncoes] = useState<FuncaoDoRamo[] | null>(null);
  const [usada, setUsada] = useState<string | null>(null);
  const ultima = useRef("");

  const limpo = texto.trim();
  useEffect(() => {
    if (escolhida || limpo.replace(/[^A-Za-z0-9]/g, "").length < 3) return;
    const espera = setTimeout(() => {
      ultima.current = limpo;
      setBuscando(true);
      acharEmpresas(limpo)
        .catch(() => [])
        .then((lista) => {
          if (ultima.current !== limpo) return;
          setResultado({ texto: limpo, lista });
          setBuscando(false);
        });
    }, 400);
    return () => clearTimeout(espera);
  }, [limpo, escolhida]);

  function escolher(e: EmpresaAchada) {
    setEscolhida(e);
    setFuncoes(null);
    setUsada(null);
    aoEscolher(e);
    if (e.cnae) {
      funcoesDoRamo(e.cnae, e.cidade || cidade)
        .catch(() => [])
        .then(setFuncoes);
    } else setFuncoes([]);
  }

  function trocar() {
    setEscolhida(null);
    setFuncoes(null);
    setResultado(null);
    setTexto("");
  }

  const lista = resultado && resultado.texto === limpo ? resultado.lista : null;

  return (
    <section
      aria-label="Sua empresa"
      className="flex flex-col gap-3 rounded-md border border-line bg-surface-100 p-3 text-body-sm sm:p-4"
    >
      {escolhida ? (
        <div className="flex items-start gap-3">
          <Building2 aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">{escolhida.nome}</p>
            <p className="text-ink-muted">
              {[escolhida.endereco, escolhida.bairro, escolhida.cidade].filter(Boolean).join(", ")}
            </p>
            <p className="mt-1 text-ink-muted">Trouxemos o endereço. Confira no passo do lugar.</p>
          </div>
          <button type="button" onClick={trocar} className="text-label text-ink underline underline-offset-2">
            Trocar
          </button>
        </div>
      ) : (
        <>
          <label htmlFor={`${id}-busca`} className="text-label text-ink">
            CNPJ ou nome da sua empresa <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <input
              id={`${id}-busca`}
              type="search"
              autoComplete="off"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                // o Enter aqui não manda a vaga
                if (e.key === "Enter") e.preventDefault();
              }}
              maxLength={80}
              placeholder="Ex.: Padaria Pão Quente ou 12.345.678/0001-90"
              aria-describedby={`${id}-ajuda`}
              className={`${classesEntrada} pl-9`}
            />
            {buscando && (
              <LoaderCircle aria-hidden className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-muted" />
            )}
          </div>
          <p id={`${id}-ajuda`} className="text-ink-muted">
            Achando a empresa, o Publike preenche o endereço e mostra o que o seu ramo mais contrata.
          </p>
          {lista && lista.length > 0 && (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-200">
              {lista.map((e) => (
                <li key={e.cnpj}>
                  <button
                    type="button"
                    onClick={() => escolher(e)}
                    className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-300"
                  >
                    <span className="font-semibold text-ink">
                      {e.nome}
                      {!e.matriz && <span className="font-normal text-ink-muted"> (filial)</span>}
                    </span>
                    <span className="text-ink-muted">
                      {[e.endereco, e.bairro, e.cidade].filter(Boolean).join(", ")}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lista && lista.length === 0 && !buscando && (
            <p role="status" className="text-ink-muted">
              Não achamos nas cidades do Publike. Tudo bem: siga preenchendo abaixo.
            </p>
          )}
        </>
      )}

      {escolhida && funcoes && funcoes.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-ink">
            <strong className="font-semibold">O que o seu ramo mais contrata em Goiás.</strong> Toque para usar no
            título:
          </p>
          <div className="flex flex-wrap gap-2">
            {funcoes.map((f) => (
              <button
                key={f.cbo}
                type="button"
                aria-pressed={usada === f.cbo}
                onClick={() => {
                  setUsada(f.cbo);
                  aoEscolherFuncao(f);
                }}
                className={`flex flex-col items-start rounded-md border px-3 py-1.5 text-left transition-colors ${
                  usada === f.cbo ? "border-ink bg-surface-300" : "border-line-strong bg-surface-200 hover:bg-surface-300"
                }`}
              >
                <span className="text-label text-ink">{f.titulo}</span>
                {f.faixa && (
                  <span className="text-ink-muted">
                    {reaisDaFaixa(f.faixa.p25)} a {reaisDaFaixa(f.faixa.p75)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
