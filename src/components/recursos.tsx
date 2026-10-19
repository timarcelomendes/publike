"use client";

import {
  Bell,
  Briefcase,
  Building2,
  Bus,
  FileText,
  HandHelping,
  Heart,
  Images,
  Layers,
  ListChecks,
  Lock,
  MapPin,
  Megaphone,
  MessagesSquare,
  RefreshCw,
  Sheet,
  Smartphone,
  Sparkles,
  Star,
  Store,
  Users,
  UserSearch,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { Intencao } from "@/lib/intencao";
import { PARA_TODOS, PERFIS, type IconeRecurso } from "@/lib/recursos";
import { classesBotao } from "./ui/botao";

const ICONES: Record<IconeRecurso, LucideIcon> = {
  mapa: MapPin,
  onibus: Bus,
  maleta: Briefcase,
  coracao: Heart,
  curriculo: FileText,
  etapas: ListChecks,
  conversa: MessagesSquare,
  aviso: Bell,
  descobrir: Layers,
  ferramenta: Wrench,
  fotos: Images,
  estrela: Star,
  loja: Store,
  renovar: RefreshCw,
  megafone: Megaphone,
  texto: Sparkles,
  pessoas: Users,
  planilha: Sheet,
  predio: Building2,
  cadeado: Lock,
  celular: Smartphone,
};

const ICONES_PERFIL: Record<Intencao, LucideIcon> = {
  trabalho: Briefcase,
  contratar_servico: Wrench,
  oferecer_servico: HandHelping,
  contratar_pessoa: UserSearch,
};

/**
 * "O que dá para fazer no Publike": abas por perfil e cartões curtos (ícone, título e
 * uma frase). Abre no perfil que a pessoa escolheu em "O que você quer fazer no Publike?".
 */
export function RecursosPorPerfil({ inicial, linkDetalhes = false }: { inicial: Intencao; linkDetalhes?: boolean }) {
  const [atual, setAtual] = useState<Intencao>(inicial);
  // na página inicial, no celular: só os 4 primeiros (a lista inteira passava de uma tela)
  const [todos, setTodos] = useState(false);
  const curto = linkDetalhes && !todos;
  const base = useId();
  const abas = useRef<(HTMLButtonElement | null)[]>([]);
  const perfil = PERFIS.find((p) => p.valor === atual) ?? PERFIS[0];

  // setas trocam de aba (padrão de abas acessíveis)
  function teclas(e: KeyboardEvent, i: number) {
    const passo =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!passo) return;
    e.preventDefault();
    const proximo = (i + passo + PERFIS.length) % PERFIS.length;
    setAtual(PERFIS[proximo].valor);
    abas.current[proximo]?.focus();
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Escolha o seu caso" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PERFIS.map((p, i) => {
          const Icone = ICONES_PERFIL[p.valor];
          const ativo = p.valor === atual;
          return (
            <button
              key={p.valor}
              ref={(el) => {
                abas.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-aba-${p.valor}`}
              aria-selected={ativo}
              aria-controls={`${base}-painel`}
              tabIndex={ativo ? 0 : -1}
              onClick={() => setAtual(p.valor)}
              onKeyDown={(e) => teclas(e, i)}
              className={`flex min-h-12 items-center gap-2 rounded-md border px-3 py-2 text-left text-label transition-colors ${
                ativo
                  ? "border-ink bg-ink text-surface-100"
                  : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
              }`}
            >
              <Icone aria-hidden className={`size-5 shrink-0 ${ativo ? "" : "text-terra-text"}`} />
              {p.aba}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${base}-painel`}
        aria-labelledby={`${base}-aba-${perfil.valor}`}
        className="flex flex-col gap-5"
      >
        <p className="max-w-2xl text-body-lg">{perfil.resumo}</p>
        <ul
          className={`grid gap-2 sm:grid-cols-2 sm:gap-3 ${perfil.recursos.length % 3 === 0 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
        >
          {perfil.recursos.map((r, i) => {
            const Icone = ICONES[r.icone];
            return (
              <li
                key={r.titulo}
                className={`flex gap-3 rounded-lg border border-line bg-surface-200 p-3 shadow-card sm:flex-col sm:gap-2 sm:p-4 ${
                  curto && i >= 4 ? "max-sm:hidden" : ""
                }`}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-terra-text">
                  <Icone aria-hidden className="size-5" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-label">{r.titulo}</span>
                  <span className="text-body-sm text-ink-muted">{r.texto}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {curto && perfil.recursos.length > 4 && (
          <button
            type="button"
            onClick={() => setTodos(true)}
            className="-mt-2 self-start text-label text-terra-text underline underline-offset-2 sm:hidden"
          >
            Ver mais {perfil.recursos.length - 4}
          </button>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link href={perfil.acao.href} className={classesBotao("primario")}>
            {perfil.acao.texto}
          </Link>
          {linkDetalhes && (
            <Link
              href="/como-funciona"
              className="text-body-sm text-ink underline underline-offset-2 hover:text-terra-text"
            >
              Como funciona, passo a passo
            </Link>
          )}
        </div>
      </div>

      <ul aria-label="Para todo mundo" className="grid gap-3 border-t border-line pt-5 sm:grid-cols-3">
        {PARA_TODOS.map((r) => {
          const Icone = ICONES[r.icone];
          return (
            <li key={r.titulo} className="flex gap-3">
              <Icone aria-hidden className="mt-0.5 size-5 shrink-0 text-cerrado-text" />
              <span className="text-body-sm">
                <strong className="font-semibold">{r.titulo}.</strong> <span className="text-ink-muted">{r.texto}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
