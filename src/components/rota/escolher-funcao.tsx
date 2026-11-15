"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { buscarFuncoes } from "@/lib/acoes/funcao";
import { classesEntrada } from "../ui/campo";

type Achada = { cbo: string; nome: string; pelo: string };

function primeiraMaiuscula(t: string) {
  const s = t.trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * A função da rota: um campo de busca em toda a CBO (o nome oficial e os sinônimos, umas 2.600 ocupações), não só
 * nas funções comuns. Sem nada digitado, mostra as comuns. Ao escolher, a página já mostra os lugares.
 */
export function EscolherFuncao({
  comuns,
  atual = "",
  raio,
  rotulo,
}: {
  comuns: { cbo: string; titulo: string }[];
  /** a função escolhida por esta busca (fica escrita no campo) */
  atual?: string;
  raio: number;
  rotulo: string;
}) {
  const router = useRouter();
  const id = useId();
  const [texto, setTexto] = useState(atual);
  const [aberto, setAberto] = useState(false);
  const [resposta, setResposta] = useState<{ q: string; achadas: Achada[] } | null>(null);
  const [ativo, setAtivo] = useState(0);
  const pedido = useRef(0);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2) return;
    const n = ++pedido.current;
    const t = window.setTimeout(async () => {
      const r = await buscarFuncoes(q).catch(() => []);
      if (n === pedido.current) {
        setResposta({ q, achadas: r });
        setAtivo(0);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [texto]);

  useEffect(() => {
    function fora(e: PointerEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, []);

  // com menos de 2 letras, as comuns; senão, a última resposta (enquanto a nova não chega)
  const achadas = texto.trim().length < 2 ? null : (resposta?.achadas ?? null);
  const opcoes: { cbo: string; titulo: string; oficial?: string }[] = achadas
    ? achadas.map((a) => {
        const titulo = primeiraMaiuscula(a.pelo);
        return { cbo: a.cbo, titulo, oficial: a.nome.toLowerCase() !== a.pelo.toLowerCase() ? a.nome : undefined };
      })
    : comuns;

  function escolher(o: { cbo: string; titulo: string }) {
    setAberto(false);
    setTexto(o.titulo);
    const p = new URLSearchParams({ cbo: o.cbo, raio: String(raio), nome: o.titulo });
    router.push(`/rota-do-curriculo?${p}`, { scroll: false });
  }

  return (
    <div ref={caixa} className="relative flex max-w-md flex-col gap-1.5">
      <label htmlFor={`${id}-busca`} className="text-body-sm text-ink-muted">
        {rotulo}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
        <input
          id={`${id}-busca`}
          type="text"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          aria-activedescendant={aberto && opcoes[ativo] ? `${id}-${ativo}` : undefined}
          autoComplete="off"
          value={texto}
          placeholder="Digite: padeiro, vendedor, manicure…"
          onFocus={() => setAberto(true)}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setAberto(true);
              setAtivo((a) => Math.min(a + 1, opcoes.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setAtivo((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && aberto && opcoes[ativo]) {
              e.preventDefault();
              escolher(opcoes[ativo]);
            } else if (e.key === "Escape") {
              setAberto(false);
            }
          }}
          className={`${classesEntrada} pl-9`}
        />
      </div>
      {aberto && (
        <div className="absolute top-full right-0 left-0 z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-line-strong bg-surface-100 shadow-raised">
          {!achadas && <p className="px-3 pt-2 pb-1 text-caption text-ink-muted">Mais procuradas</p>}
          {achadas && achadas.length === 0 ? (
            <p className="px-3 py-3 text-body-sm text-ink-muted">Nenhuma função com esse nome. Tente outra palavra.</p>
          ) : (
            <ul id={`${id}-lista`} role="listbox" className="py-1">
              {opcoes.map((o, i) => (
                <li
                  key={o.cbo}
                  id={`${id}-${i}`}
                  role="option"
                  aria-selected={i === ativo}
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => escolher(o)}
                  onMouseEnter={() => setAtivo(i)}
                  className={`cursor-pointer px-3 py-2 ${i === ativo ? "bg-surface-300" : ""}`}
                >
                  <span className="block text-body-sm text-ink">{o.titulo}</span>
                  {o.oficial && <span className="block text-caption text-ink-muted">{o.oficial}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
