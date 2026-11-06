"use client";

import { BellPlus, BellRing, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { salvarBusca } from "@/lib/acoes/buscas";
import { registrarFunilVisitante } from "@/lib/acoes/funil-visitante";
import { pedirEntrar } from "./folha-de-entrar";

// O convite que acompanha o que a pessoa vê (claude/plano-visitante-que-entra.md): na página da vaga, para quem está
// sem conta, o site guarda só neste aparelho a área das vagas abertas. Na segunda vaga da mesma área, um cartão fixo
// embaixo da tela (não é janela por cima) diz quantas vagas dessa área há na cidade e oferece receber as novas. Ao
// entrar, a pessoa volta para esta vaga com ?avisar_area=1 e o aviso de busca da área é criado aqui mesmo.

const CHAVE = "publike_vagas_vistas";
const CHAVE_DEPOIS = "publike_convite_depois";
const SETE_DIAS = 7 * 24 * 3600 * 1000;
export const PARAMETRO_DA_VOLTA = "avisar_area";

type Vista = { id: string; area: string; em: number };

function lerVistas(): Vista[] {
  try {
    const lista = JSON.parse(window.localStorage.getItem(CHAVE) ?? "[]");
    return Array.isArray(lista) ? lista.filter((v) => v && typeof v.id === "string" && typeof v.area === "string") : [];
  } catch {
    return [];
  }
}

/** Guarda a vaga vista (as últimas 12, dos últimos 7 dias) e diz quantas vagas diferentes da área foram vistas. */
function guardarVista(id: string, area: string) {
  const agora = Date.now();
  const lista = [{ id, area, em: agora }, ...lerVistas().filter((v) => v.id !== id && agora - v.em < SETE_DIAS)].slice(
    0,
    12,
  );
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(lista));
  } catch {}
  return lista.filter((v) => v.area === area).length;
}

function adiado() {
  try {
    return Date.now() < Number(window.localStorage.getItem(CHAVE_DEPOIS) ?? 0);
  } catch {
    return false;
  }
}

export function ConviteDasVagasVistas({
  logado,
  anuncioId,
  area,
  nomeDaArea,
  cidade,
  total,
}: {
  logado: boolean;
  anuncioId: string;
  /** o slug da área (categoria) */
  area: string;
  nomeDaArea: string;
  cidade: string;
  /** quantas vagas da área estão no ar na cidade */
  total: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [pronto, setPronto] = useState<"criando" | "ok" | "erro" | null>(null);
  const router = useRouter();
  const caminho = usePathname();
  const fez = useRef(false);

  useEffect(() => {
    if (fez.current) return;
    fez.current = true;
    const url = new URL(window.location.href);
    // voltou do /entrar pelo convite: cria o aviso das vagas novas da área e tira o parâmetro do endereço
    if (logado) {
      if (url.searchParams.get(PARAMETRO_DA_VOLTA) !== "1") return;
      url.searchParams.delete(PARAMETRO_DA_VOLTA);
      router.replace(`${url.pathname}${url.search}`, { scroll: false });
      // eslint-disable-next-line react-hooks/set-state-in-effect -- o endereço só é lido depois de montar
      setPronto("criando");
      salvarBusca(`/?tipo=vaga&categoria=${encodeURIComponent(area)}`)
        .then((r) => setPronto(r.ok ? "ok" : "erro"))
        .catch(() => setPronto("erro"));
      return;
    }
    const vistas = guardarVista(anuncioId, area);
    if (vistas >= 2 && total >= 3 && !adiado()) {
      setAberto(true);
      void registrarFunilVisitante("convite_mostrou").catch(() => {});
    }
  }, [logado, anuncioId, area, total, router]);

  function depois() {
    try {
      window.localStorage.setItem(CHAVE_DEPOIS, String(Date.now() + SETE_DIAS));
    } catch {}
    setAberto(false);
  }

  if (pronto) {
    return (
      <div
        role="status"
        className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-lg items-center gap-3 rounded-lg border border-line bg-surface-100 px-4 py-3 shadow-raised md:bottom-6 print:hidden"
      >
        <BellRing aria-hidden className="size-5 shrink-0 text-cerrado" />
        <p className="flex-1 text-body-sm">
          {pronto === "criando"
            ? "Criando o seu aviso…"
            : pronto === "ok"
              ? `Pronto: você recebe as vagas novas de ${nomeDaArea} por e-mail e no sino.`
              : "Não deu para criar o aviso agora. Toque em “Me avise de vagas assim” na lista de vagas."}
        </p>
        {pronto !== "criando" && (
          <button
            type="button"
            onClick={() => setPronto(null)}
            aria-label="Fechar"
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-300"
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>
    );
  }

  if (!aberto) return null;
  const volta = `${caminho}?${PARAMETRO_DA_VOLTA}=1`;
  return (
    <aside
      aria-label="Receber as vagas novas"
      className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-lg flex-col gap-3 rounded-lg border border-line bg-surface-100 p-4 shadow-raised md:bottom-6 print:hidden"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-300">
          <BellPlus aria-hidden className="size-5 text-terra-text" />
        </span>
        <p className="flex-1 text-body">
          <strong className="font-semibold">
            Tem {total} vagas de {nomeDaArea} em {cidade}.
          </strong>{" "}
          Quer receber as novas assim que abrirem?
        </p>
        <button
          type="button"
          onClick={depois}
          aria-label="Agora não"
          className="-mt-1 -mr-1 grid size-9 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-300"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-13">
        <Link
          href={`/entrar?next=${encodeURIComponent(volta)}`}
          onClick={(e) => {
            void registrarFunilVisitante("convite_tocou").catch(() => {});
            // a folha de entrar por cima da página; sem ela, o link leva ao /entrar
            if (pedirEntrar({ proximo: volta })) {
              e.preventDefault();
              setAberto(false);
            }
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-terra px-5 text-label text-on-terra hover:opacity-90"
        >
          Receber as novas
        </Link>
        <button
          type="button"
          onClick={depois}
          className="min-h-11 text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Agora não
        </button>
      </div>
      <p className="pl-13 text-caption text-ink-muted">Grátis. Chega por e-mail e no sino do Publike.</p>
    </aside>
  );
}
