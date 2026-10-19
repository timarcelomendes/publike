"use client";

import { Building2, Share2, Store, UserRound, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import { idDoCaminho, type PerfilAjuda } from "@/lib/ajuda";
import { TIPOS_CONTA } from "@/lib/constantes";
import type { TipoConta } from "@/lib/tipos";
import { PassosDoCaminho } from "./passos-caminho";

const ICONES: Record<TipoConta, LucideIcon> = {
  pessoa: UserRound,
  comercio: Store,
  empresa: Building2,
  agencia: Users,
};

/**
 * O passo a passo por tipo de conta (o mesmo "Você é" do cadastro): uma aba por tipo e, quando o
 * tipo tem mais de um caminho (a pessoa que procura trabalho, oferece serviço ou contrata para
 * casa), a escolha do caminho. Cada passo tem o atalho para a tela certa.
 */
export function JornadasAjuda({
  perfis,
  inicial,
}: {
  perfis: PerfilAjuda[];
  inicial: { tipo: TipoConta; jornada?: string };
}) {
  const [tipo, setTipo] = useState<TipoConta>(inicial.tipo);
  const [escolhida, setEscolhida] = useState<Record<string, string>>(
    inicial.jornada ? { [inicial.tipo]: inicial.jornada } : {},
  );
  const base = useId();
  const abas = useRef<(HTMLButtonElement | null)[]>([]);
  const perfil = perfis.find((p) => p.tipo === tipo) ?? perfis[0];
  const jornada = perfil.jornadas.find((j) => j.id === escolhida[perfil.tipo]) ?? perfil.jornadas[0];

  // setas trocam de aba (padrão de abas acessíveis)
  function teclas(e: KeyboardEvent, i: number) {
    const passo =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const proximo = (i + passo + perfis.length) % perfis.length;
    setTipo(perfis[proximo].tipo);
    abas.current[proximo]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-label">Você é</p>
        <div role="tablist" aria-label="Você é" className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {perfis.map((p, i) => {
            const Icone = ICONES[p.tipo];
            const ativo = p.tipo === tipo;
            return (
              <button
                key={p.tipo}
                ref={(el) => {
                  abas.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${base}-aba-${p.tipo}`}
                aria-selected={ativo}
                aria-controls={`${base}-painel`}
                tabIndex={ativo ? 0 : -1}
                onClick={() => setTipo(p.tipo)}
                onKeyDown={(e) => teclas(e, i)}
                className={`flex min-h-14 items-start gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors ${
                  ativo
                    ? "border-ink bg-ink text-surface-100"
                    : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
                }`}
              >
                <Icone aria-hidden className={`mt-0.5 size-5 shrink-0 ${ativo ? "" : "text-terra-text"}`} />
                <span className="flex min-w-0 flex-col">
                  <span className="text-label">{TIPOS_CONTA[p.tipo].nome}</span>
                  <span className={`text-body-sm ${ativo ? "opacity-80" : "text-ink-muted"}`}>
                    {TIPOS_CONTA[p.tipo].ajuda}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`${base}-painel`}
        aria-labelledby={`${base}-aba-${perfil.tipo}`}
        className="flex flex-col gap-5"
      >
        {perfil.jornadas.length > 1 && (
          <div role="group" aria-label="O que você quer fazer" className="flex flex-wrap gap-2">
            {perfil.jornadas.map((j) => {
              const ativo = j.id === jornada.id;
              return (
                <button
                  key={j.id}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => setEscolhida((e) => ({ ...e, [perfil.tipo]: j.id }))}
                  className={`inline-flex min-h-10 items-center rounded-pill border px-3.5 text-label transition-colors ${
                    ativo
                      ? "border-terra-text bg-terra-soft text-terra-text"
                      : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
                  }`}
                >
                  {j.nome}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-2xl text-body-lg">{jornada.resumo}</p>
          <Link
            href={`/ajuda/caminho/${idDoCaminho(perfil.tipo, jornada.id)}`}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 text-label text-terra-text underline-offset-2 hover:underline"
          >
            <Share2 aria-hidden className="size-4" />
            Abrir para compartilhar
          </Link>
        </div>
        <PassosDoCaminho passos={jornada.passos} nivel={3} />
      </div>
    </div>
  );
}
