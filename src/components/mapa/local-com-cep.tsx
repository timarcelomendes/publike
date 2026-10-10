"use client";

import { Search } from "lucide-react";
import { useId, useState, useTransition, type ReactNode } from "react";
import { buscarCep } from "@/lib/acoes/cep";
import { formatarCep, limparCep, montarEndereco, TEXTO_PRECISAO } from "@/lib/cep";
import { Botao } from "../ui/botao";
import { classesEntrada, MensagemErro } from "../ui/campo";
import { SeletorLocal } from "./seletor-local";

type Ponto = { lat: number; lng: number };

/**
 * "Onde é" do anúncio: CEP + número levam o pino até a porta e preenchem a
 * cidade e o bairro; depois a pessoa confere e ajusta no mapa.
 * Comércio, empresa e agência (`publico`) mostram o endereço na vaga, e o ponto
 * fica exato. Pessoa física usa o CEP só para achar o lugar: na vaga aparece
 * uma área de ~500 m, sem endereço.
 */
export function LocalComCep({
  inicial,
  inicialCep,
  inicialEndereco,
  publico,
  erro,
  aoAchar,
  children,
}: {
  inicial: Ponto | null;
  inicialCep?: string | null;
  inicialEndereco?: string | null;
  publico: boolean;
  erro?: string;
  /** a cidade e o bairro do CEP, para preencher os campos do formulário */
  aoAchar: (lugar: { cidade: string; bairro: string | null }) => void;
  /** cidade e bairro do formulário, entre o CEP e o endereço */
  children?: ReactNode;
}) {
  const id = useId();
  const [cep, setCep] = useState(formatarCep(inicialCep));
  const [numero, setNumero] = useState("");
  const [endereco, setEndereco] = useState(inicialEndereco ?? "");
  const [rua, setRua] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [irPara, setIrPara] = useState<(Ponto & { vez: number; zoom?: number; marcar?: boolean }) | null>(null);
  const [buscando, iniciar] = useTransition();

  function buscar() {
    setFalha(null);
    setAviso(null);
    iniciar(async () => {
      const r = await buscarCep(limparCep(cep), numero);
      if (!r.ok) {
        setFalha(r.erro);
        return;
      }
      setCep(formatarCep(r.endereco.cep));
      setRua(r.endereco.rua);
      if (r.endereco.rua) setEndereco(montarEndereco(r.endereco.rua, numero) ?? "");
      aoAchar({ cidade: r.endereco.cidade, bairro: r.endereco.bairro });
      if (r.ponto) {
        setIrPara({ ...r.ponto, vez: Date.now(), zoom: r.precisao === "bairro" ? 15 : 17 });
        setAviso(
          r.precisao === "rua" && !numero.trim()
            ? "Achamos a rua. Ponha o número para chegar mais perto, ou toque no mapa na porta certa."
            : r.precisao
              ? TEXTO_PRECISAO[r.precisao]
              : null,
        );
      } else {
        // abre o mapa na cidade, sem marcar: a pessoa toca no lugar
        if (r.centro) setIrPara({ ...r.centro, vez: Date.now(), zoom: 13, marcar: false });
        setAviso("Achamos o endereço, mas não o ponto no mapa. Toque no mapa para marcar o local.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-label" id={`${id}-titulo`}>
          Ache pelo CEP
        </p>
        <div
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[10rem_8rem_auto]"
          role="group"
          aria-labelledby={`${id}-titulo`}
        >
          <label className="sr-only" htmlFor={`${id}-cep`}>
            CEP
          </label>
          <input
            id={`${id}-cep`}
            name="cep"
            value={cep}
            onChange={(e) => setCep(formatarCep(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                buscar();
              }
            }}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="CEP"
            maxLength={9}
            className={classesEntrada}
          />
          <label className="sr-only" htmlFor={`${id}-numero`}>
            Número
          </label>
          <input
            id={`${id}-numero`}
            value={numero}
            onChange={(e) => setNumero(e.target.value.slice(0, 10))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                buscar();
              }
            }}
            placeholder="Número"
            autoComplete="off"
            className={classesEntrada}
          />
          <Botao
            tamanho="md"
            onClick={buscar}
            disabled={buscando || limparCep(cep).length !== 8}
            className="col-span-2 sm:col-span-1"
          >
            <Search aria-hidden />
            {buscando ? "Procurando…" : "Achar no mapa"}
          </Botao>
        </div>
        {falha ? (
          <MensagemErro>{falha}</MensagemErro>
        ) : (
          <p className="text-body-sm text-ink-muted" aria-live="polite">
            {aviso ??
              (publico
                ? "Com o endereço certo, quem mora perto acha sua vaga e sabe quanto tempo leva para chegar."
                : "O CEP só ajuda a achar o lugar. Na vaga aparece uma área de uns 500 m, sem o endereço.")}
          </p>
        )}
      </div>

      {children}

      {publico && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-endereco`} className="text-label">
            Endereço <span className="font-normal text-ink-muted">(aparece na vaga)</span>
          </label>
          <input
            id={`${id}-endereco`}
            name="endereco"
            value={endereco}
            onChange={(e) => setEndereco(e.target.value.slice(0, 120))}
            placeholder={rua ? `${rua}, número` : "Ex.: Rua 90, 1200"}
            autoComplete="off"
            className={classesEntrada}
          />
          <p className="text-body-sm text-ink-muted">
            Rua e número, como na fachada. Deixe em branco para mostrar só uma área de uns 500 m.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <p className="text-label">
          {publico && endereco.trim() ? "Confira o pino no mapa" : "Marque a região no mapa"}
        </p>
        <SeletorLocal inicial={inicial} erro={erro} exato={publico && endereco.trim() !== ""} irPara={irPara} />
      </div>
    </div>
  );
}
