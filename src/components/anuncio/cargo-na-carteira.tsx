"use client";

import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { buscarFuncoes, sugerirFuncao } from "@/lib/acoes/funcao";
import { codigoCbo, funcaoPeloTitulo, type FuncaoParaForm } from "@/lib/funcao-cbo";
import { classesEntrada } from "../ui/campo";

/**
 * "Função (CBO)" (claude/plano-salario-e-curriculo.md, parte 2): a ocupação da CBO da vaga, o código que vai na
 * carteira e o que o Novo Caged usa (a faixa de salário do mercado vem por ele). Sugere pelo título enquanto a
 * pessoa digita (as regras na hora; sem regra, o servidor, com a IA para quem entrou); "Trocar" busca na CBO. A
 * escolha da pessoa não muda mais com o título. Vai no formulário como `cbo`.
 */
export function CargoNaCarteira({
  titulo,
  descricao,
  valor,
  aoMudar,
}: {
  titulo: string;
  descricao: string;
  valor: FuncaoParaForm | null;
  aoMudar: (f: FuncaoParaForm | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [achadas, setAchadas] = useState<{ cbo: string; nome: string; pelo: string }[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  // "Não informar o cargo": a sugestão pelo título para de vir
  const [recusou, setRecusou] = useState(false);
  // a sugestão pelo título: a resposta antiga do servidor não passa por cima da nova
  const pedido = useRef(0);
  const primeira = useRef(true);
  const escolhida = valor?.origem === "empresa";

  useEffect(() => {
    // ao abrir para editar, a função que veio do banco fica (o título é o mesmo)
    if (primeira.current) {
      primeira.current = false;
      if (valor) return;
    }
    if (escolhida || recusou) return;
    const n = ++pedido.current;
    const t = window.setTimeout(async () => {
      const regra = funcaoPeloTitulo(titulo);
      if (regra) {
        aoMudar({ ...regra, origem: "regra" });
        return;
      }
      if (titulo.trim().split(/\s+/).length < 2) {
        aoMudar(null);
        return;
      }
      const f = await sugerirFuncao(titulo, descricao).catch(() => null);
      if (n === pedido.current) aoMudar(f);
    }, 700);
    return () => window.clearTimeout(t);
    // a descrição entra na sugestão, mas só o título pede de novo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulo, escolhida, recusou]);

  // a busca na CBO: a cada letra, espera 300 ms; a resposta antiga não passa por cima da nova
  const busco = useRef<{ timer?: number; n: number }>({ n: 0 });
  function mudarBusca(texto: string) {
    setBusca(texto);
    window.clearTimeout(busco.current.timer);
    const q = texto.trim();
    const n = ++busco.current.n;
    if (q.length < 2) {
      setAchadas(null);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    busco.current.timer = window.setTimeout(async () => {
      const r = await buscarFuncoes(q).catch(() => []);
      if (n !== busco.current.n) return;
      setAchadas(r);
      setBuscando(false);
    }, 300);
  }

  function escolher(f: { cbo: string; nome: string } | null) {
    setRecusou(!f);
    aoMudar(f ? { ...f, origem: "empresa" } : null);
    setAberto(false);
    setBusca("");
    setAchadas(null);
  }

  return (
    <div className="flex flex-col gap-2 text-body-sm">
      <input type="hidden" name="cbo" value={valor?.cbo ?? ""} />
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-ink-muted">Função (CBO):</span>
        {valor ? (
          <>
            <strong className="font-semibold">{valor.nome}</strong>
            <span className="text-caption text-ink-muted">CBO {codigoCbo(valor.cbo)}</span>
          </>
        ) : (
          <span className="text-ink-muted">não informada</span>
        )}
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="min-h-9 text-label text-terra-text underline underline-offset-2"
        >
          {aberto ? "Fechar" : valor ? "Trocar" : "Escolher"}
        </button>
      </p>
      {!aberto && valor && !escolhida && (
        <p className="text-caption text-ink-muted">
          Pelo título. É a função da CBO, o código da carteira, e é por ela que mostramos quanto o mercado paga.
        </p>
      )}
      {aberto && (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3">
          <label className="relative">
            <span className="sr-only">Buscar a função na CBO</span>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => mudarBusca(e.target.value)}
              placeholder="Ex.: auxiliar de cozinha, repositor ou o código"
              autoFocus
              className={`${classesEntrada} pl-9`}
            />
          </label>
          {buscando && <p className="text-caption text-ink-muted">Buscando…</p>}
          {achadas && !buscando && !achadas.length && (
            <p className="text-caption text-ink-muted">Nenhuma função parecida. Tente outra palavra.</p>
          )}
          {achadas && achadas.length > 0 && (
            <ul className="flex flex-col">
              {achadas.map((o) => (
                <li key={o.cbo}>
                  <button
                    type="button"
                    onClick={() => escolher(o)}
                    className="flex min-h-11 w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-surface-300"
                  >
                    <span className="font-semibold">{o.nome}</span>
                    <span className="text-caption text-ink-muted">
                      CBO {codigoCbo(o.cbo)}
                      {o.pelo !== o.nome && ` · “${o.pelo}”`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {valor && (
            <button
              type="button"
              onClick={() => escolher(null)}
              className="inline-flex min-h-9 items-center gap-1 self-start text-label text-ink-muted underline underline-offset-2"
            >
              <X aria-hidden className="size-4" />
              Não informar a função
            </button>
          )}
        </div>
      )}
    </div>
  );
}
