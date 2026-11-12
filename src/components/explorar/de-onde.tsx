"use client";

import { House, Route } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { Filtros } from "@/lib/filtros";
import { esquecerPerto } from "@/lib/perto-guardado";
import type { Local } from "@/lib/regioes";
import { AVISOS_GPS, pedirPosicao, useIrPara } from "./barra-busca";
import { PainelOndeMora } from "./onde-mora";

/** O ponto de quem procura, como no mapa e no cartão ("Você"). `claro`: no botão escolhido (escuro). */
function PontoVoce({ claro }: { claro: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex size-4 items-center justify-center rounded-pill ${claro ? "bg-surface-100/30" : "bg-ink/15"}`}
    >
      <span
        className={`size-2.5 rounded-pill border-2 ${claro ? "border-ink bg-surface-100" : "border-surface-200 bg-ink"}`}
      />
    </span>
  );
}

/**
 * De onde contam a distância, o tempo e a linha do mapa, à vista e para trocar (12/11/2026, pedido do Marcelo: quem
 * usou o "Perto de mim" via "Você" nos cartões sem saber que era onde ele está agora). Fica embaixo dos raios, na
 * linha "Até 25 km de onde você está agora · Mudar"; o "Trocar" do mapa abre essa linha. "Minha casa" sem o CEP
 * abre o "Onde você mora?" aqui mesmo. Sem casa, a terceira opção é o que a busca usa sem origem: o centro da
 * cidade, o meio do bairro ou a região (`semOrigem`, "Centro de Goiânia").
 */
export function DeOnde({
  filtros,
  casa,
  local,
  cidade,
  semOrigem,
}: {
  /** os filtros da URL (os links e a troca partem deles) */
  filtros: Filtros;
  /** a pessoa deu o CEP de casa: "Minha casa" troca na hora */
  casa: boolean;
  local: Local | null;
  cidade: string;
  semOrigem: string;
}) {
  const [ir, pendente] = useIrPara(filtros);
  const [procurando, setProcurando] = useState(false);
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [pedindoCep, setPedindoCep] = useState(false);
  const painel = useId();
  const atual = filtros.origem === "gps" ? "voce" : filtros.origem === "mapa" ? "mapa" : casa ? "casa" : "centro";

  function daqui() {
    if (atual === "voce") return;
    setAvisoGps(null);
    setProcurando(true);
    pedirPosicao(
      ({ lat, lng }) => {
        setProcurando(false);
        ir({ lat, lng, origem: "gps" });
      },
      (motivo) => {
        setProcurando(false);
        setAvisoGps(AVISOS_GPS[motivo]);
      },
    );
  }

  // como o "Perto de mim" desligado: esquece a posição guardada e volta a contar de casa (ou do centro)
  function semGps() {
    esquecerPerto();
    ir({ origem: "centro" });
  }

  function deCasa() {
    if (atual === "casa") return;
    if (!casa) return setPedindoCep((a) => !a);
    semGps();
  }

  return (
    <div data-de-onde className="flex flex-col gap-2">
      <div role="group" aria-label="De onde contar" className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="inline-flex items-center gap-1 text-body-sm font-semibold text-ink">
          <Route aria-hidden className="size-4 shrink-0 text-ink-muted" />
          De onde
        </span>
        <span className="flex flex-wrap gap-1">
          <Opcao atual={atual === "voce"} onClick={daqui} ocupado={procurando || pendente}>
            <PontoVoce claro={atual === "voce"} />
            {procurando ? "Procurando você…" : "Onde estou agora"}
          </Opcao>
          <Opcao atual={atual === "casa"} onClick={deCasa} aberto={casa ? undefined : pedindoCep} controla={painel}>
            <House aria-hidden className="size-4 shrink-0" />
            {casa ? "Minha casa" : "Minha casa (CEP)"}
          </Opcao>
          {!casa && (
            <Opcao atual={atual === "centro"} onClick={atual === "centro" ? undefined : semGps}>
              {semOrigem}
            </Opcao>
          )}
          {atual === "mapa" && <Opcao atual>Área escolhida no mapa</Opcao>}
        </span>
      </div>
      {avisoGps && (
        <p role="status" className="text-body-sm text-terra-text">
          {avisoGps}
        </p>
      )}
      {pedindoCep && (
        <PainelOndeMora
          id={painel}
          local={local}
          cidadePadrao={cidade}
          fechar={() => setPedindoCep(false)}
          aoSalvar={semGps}
        />
      )}
    </div>
  );
}

/** Uma opção, com a cara dos botões dos raios (a escolhida, escura). */
function Opcao({
  atual,
  onClick,
  ocupado = false,
  aberto,
  controla,
  children,
}: {
  atual: boolean;
  onClick?: () => void;
  ocupado?: boolean;
  aberto?: boolean;
  controla?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={atual}
      aria-expanded={aberto}
      aria-controls={aberto === undefined ? undefined : controla}
      disabled={ocupado}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3 text-body-sm disabled:cursor-wait ${
        atual
          ? "border-ink bg-ink font-semibold text-surface-100"
          : "border-line-strong bg-surface-100 text-ink hover:bg-surface-300"
      }`}
    >
      {children}
    </button>
  );
}
