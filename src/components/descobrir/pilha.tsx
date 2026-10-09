"use client";

import {
  BadgeCheck,
  Briefcase,
  Building2,
  Clock,
  FileText,
  GraduationCap,
  Heart,
  MapPin,
  Sparkles,
  Star,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition, type PointerEvent as EventoPonteiro } from "react";
import { curtirAnuncio } from "@/lib/acoes/curtidas";
import { passarVaga, salvarVaga, verPassadasDeNovo } from "@/lib/acoes/descobrir";
import type { Motivo } from "@/lib/descobrir";
import { Selo } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";

/** O que o cartão mostra (montado no servidor). */
export type CartaVaga = {
  id: string;
  titulo: string;
  quem: string;
  quemTipo: string;
  verificado: boolean;
  /** vaga de agência: a empresa (ou "Empresa confidencial") */
  contratante: string | null;
  valor: string;
  regime: string;
  lugar: string;
  distancia: string | null;
  nota: number;
  motivos: Motivo[];
  pedeCurriculo: boolean;
  resumo: string;
  curtidasSemana: number;
};

type Gesto = "curtir" | "passar" | "salvar";

const ICONES: Record<Motivo["tipo"], LucideIcon> = {
  perto: MapPin,
  area: Briefcase,
  horario: Clock,
  cnh: BadgeCheck,
  estudo: GraduationCap,
  nova: Sparkles,
  curriculo: FileText,
};

const LIMIAR = 110;

/** Anel com a nota de compatibilidade (0 a 100). */
function Anel({ nota }: { nota: number }) {
  const raio = 22;
  const volta = 2 * Math.PI * raio;
  const cor = nota >= 70 ? "var(--pk-cerrado)" : nota >= 45 ? "var(--pk-ipe)" : "var(--pk-ink-muted)";
  return (
    <div className="relative size-14 shrink-0" title="Quanto esta vaga combina com você">
      <svg viewBox="0 0 52 52" className="size-14 -rotate-90" aria-hidden>
        <circle cx="26" cy="26" r={raio} fill="none" stroke="var(--pk-surface-300)" strokeWidth="5" />
        <circle
          cx="26"
          cy="26"
          r={raio}
          fill="none"
          stroke={cor}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - nota / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-display text-[17px] font-bold text-ink">{nota}%</span>
      </span>
      <span className="sr-only">Combina {nota}% com você</span>
    </div>
  );
}

function Carimbo({ texto, classe, visivel }: { texto: string; classe: string; visivel: number }) {
  return (
    <span
      aria-hidden
      style={{ opacity: Math.min(1, Math.max(0, visivel)) }}
      className={`pointer-events-none absolute top-6 z-10 rounded-md border-4 px-3 py-1 font-display text-h3 font-extrabold tracking-wider uppercase ${classe}`}
    >
      {texto}
    </span>
  );
}

function Cartao({ c, topo }: { c: CartaVaga; topo: boolean }) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-hidden rounded-lg border border-line bg-surface-200 p-5 shadow-raised select-none sm:p-6">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-1.5">
            <Selo>{c.regime}</Selo>
            {c.pedeCurriculo && (
              <Selo variante="contorno">
                <FileText aria-hidden />
                Pede currículo
              </Selo>
            )}
            {c.curtidasSemana >= 3 && <Selo variante="aviso">Em alta</Selo>}
          </div>
          <h2 className="mt-2 text-h3 leading-tight text-ink sm:text-h2">{c.titulo}</h2>
          <p className="mt-1 flex items-center gap-1 text-body-sm text-ink-muted">
            <span className="truncate">
              {c.quem} · {c.quemTipo}
            </span>
            {c.verificado && <BadgeCheck aria-label="Perfil verificado" className="size-4 shrink-0 text-cerrado-text" />}
          </p>
          {c.contratante && (
            <p className="mt-0.5 flex items-center gap-1 text-body-sm text-ink">
              <Building2 aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="truncate">Para {c.contratante}</span>
            </p>
          )}
        </div>
        <Anel nota={c.nota} />
      </div>

      <div className="flex flex-col gap-1">
        <p className="font-display text-h3 text-ink">{c.valor}</p>
        <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
          <MapPin aria-hidden className="size-4 shrink-0 text-terra-text" />
          {c.lugar}
          {c.distancia && ` · ${c.distancia}`}
        </p>
      </div>

      {c.motivos.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Por que combina com você">
          {c.motivos.slice(0, 4).map((m) => {
            const Icone = ICONES[m.tipo];
            return (
              <li
                key={m.texto}
                className="inline-flex items-center gap-1 rounded-pill bg-surface-300 px-2.5 py-1 text-body-sm text-ink"
              >
                <Icone aria-hidden className="size-3.5 text-ink-muted" />
                {m.texto}
              </li>
            );
          })}
        </ul>
      )}

      <p className="line-clamp-3 text-body text-ink-muted sm:line-clamp-6">{c.resumo}</p>

      <Link
        href={`/anuncio/${c.id}`}
        tabIndex={topo ? 0 : -1}
        className="mt-auto self-start text-label text-terra-text underline-offset-2 hover:underline"
        onPointerDown={(e) => e.stopPropagation()}
      >
        Ver a vaga inteira
      </Link>
    </div>
  );
}

/**
 * Pilha de vagas para deslizar: direita curte, esquerda passa, para cima salva.
 * Também funciona com os botões e com as setas do teclado.
 */
export function PilhaDeVagas({
  cartas: cartasIniciais,
  logado,
  temCurriculo,
  passadas,
}: {
  cartas: CartaVaga[];
  logado: boolean;
  temCurriculo: boolean;
  /** quantas vagas a pessoa passou nos últimos 30 dias (para oferecer ver de novo) */
  passadas: number;
}) {
  const router = useRouter();
  // A pilha guarda as cartas de quando abriu: curtir e salvar atualizam a página
  // no servidor, e a lista nova (sem a vaga curtida) não pode embaralhar a pilha.
  const [cartas] = useState(cartasIniciais);
  const [indice, setIndice] = useState(0);
  const [arrasto, setArrasto] = useState({ x: 0, y: 0, ativo: false });
  const [saindo, setSaindo] = useState<Gesto | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; link?: { href: string; nome: string } } | null>(null);
  const [historico, setHistorico] = useState<{ indice: number; gesto: Gesto }[]>([]);
  const [, iniciar] = useTransition();
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const atual = cartas[indice];
  const proxima = cartas[indice + 1];

  const decidir = useCallback(
    (gesto: Gesto) => {
      if (!atual || saindo) return;
      if (!logado) {
        router.push("/entrar?next=/descobrir");
        return;
      }
      setSaindo(gesto);
      const carta = atual;
      iniciar(async () => {
        const r =
          gesto === "curtir"
            ? await curtirAnuncio(carta.id)
            : gesto === "salvar"
              ? await salvarVaga(carta.id)
              : await passarVaga(carta.id);
        if (!r.ok) {
          if (r.ir) router.push(r.ir);
          setAviso({ texto: r.erro });
          return;
        }
        if (gesto === "curtir") {
          setAviso(
            carta.pedeCurriculo && !temCurriculo
              ? {
                  texto: `Você curtiu “${carta.titulo}”. Esta vaga pede currículo: o match só acontece depois que você preencher o seu.`,
                  link: { href: "/perfil/curriculo", nome: "Preencher currículo" },
                }
              : { texto: `Você curtiu “${carta.titulo}”. Se gostarem de você também, dá match e o WhatsApp aparece.` },
          );
        } else if (gesto === "salvar") {
          setAviso({ texto: `“${carta.titulo}” está nas suas salvas.`, link: { href: "/descobrir?aba=salvas", nome: "Ver salvas" } });
        } else {
          setAviso(null);
        }
      });
      // a carta sai voando e a próxima sobe
      setTimeout(() => {
        setHistorico((h) => [...h.slice(-9), { indice, gesto }]);
        setIndice((i) => i + 1);
        setSaindo(null);
        setArrasto({ x: 0, y: 0, ativo: false });
      }, 260);
    },
    [atual, saindo, logado, router, temCurriculo, indice],
  );

  // curtida não volta pela pilha (desfazer curtida fica na própria vaga)
  const ultimo = historico[historico.length - 1];
  const podeVoltar = Boolean(ultimo && ultimo.gesto !== "curtir" && !saindo);
  function voltar() {
    if (!ultimo || ultimo.gesto === "curtir") return;
    const carta = cartas[ultimo.indice];
    setHistorico((h) => h.slice(0, -1));
    setIndice(ultimo.indice);
    setAviso(null);
    iniciar(async () => {
      if (ultimo.gesto === "passar") await passarVaga(carta.id, false);
      else await salvarVaga(carta.id, false);
    });
  }

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      if (alvo && ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)) return;
      if (e.key === "ArrowRight") decidir("curtir");
      else if (e.key === "ArrowLeft") decidir("passar");
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        decidir("salvar");
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [decidir]);

  function apertar(e: EventoPonteiro<HTMLDivElement>) {
    if (saindo) return;
    inicio.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrasto({ x: 0, y: 0, ativo: true });
  }
  function mover(e: EventoPonteiro<HTMLDivElement>) {
    if (!inicio.current) return;
    setArrasto({ x: e.clientX - inicio.current.x, y: e.clientY - inicio.current.y, ativo: true });
  }
  function soltar() {
    if (!inicio.current) return;
    inicio.current = null;
    const { x, y } = arrasto;
    if (x > LIMIAR) decidir("curtir");
    else if (x < -LIMIAR) decidir("passar");
    else if (y < -LIMIAR && Math.abs(x) < LIMIAR) decidir("salvar");
    else setArrasto({ x: 0, y: 0, ativo: false });
  }

  if (!atual) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-line-strong bg-surface-200 px-6 py-12 text-center">
        <Sparkles aria-hidden className="size-8 text-ipe" />
        <p className="font-display text-h3">Você viu todas as vagas por aqui</p>
        <p className="max-w-md text-body text-ink-muted">
          Novas vagas chegam todo dia. Enquanto isso, veja o que está em alta ou as vagas do seu bairro.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <BotaoLink href="/descobrir?aba=em-alta">Ver em alta</BotaoLink>
          <BotaoLink href="/descobrir?aba=perto">No seu bairro</BotaoLink>
        </div>
        {podeVoltar && (
          <button
            type="button"
            onClick={voltar}
            aria-label="Voltar a última vaga"
            className="inline-flex min-h-11 items-center gap-2 text-label text-ink underline-offset-2 hover:underline"
          >
            <Undo2 aria-hidden className="size-4" />
            Voltar a última vaga
          </button>
        )}
        {passadas > 0 && logado && (
          <button
            type="button"
            onClick={() =>
              iniciar(async () => {
                await verPassadasDeNovo();
                setIndice(0);
                setHistorico([]);
              })
            }
            className="min-h-11 text-label text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Rever as {passadas} vagas que você passou
          </button>
        )}
      </div>
    );
  }

  // posição da carta de cima: arrastando ou saindo
  const fora = saindo === "curtir" ? { x: 640, y: arrasto.y } : saindo === "passar" ? { x: -640, y: arrasto.y } : saindo === "salvar" ? { x: 0, y: -720 } : arrasto;
  const giro = fora.x / 18;
  const transicao = arrasto.ativo && !saindo ? "none" : "transform 260ms ease-out, opacity 260ms ease-out";

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto h-[27rem] w-full max-w-md sm:h-[32rem]" aria-live="polite">
        {proxima && (
          <div aria-hidden className="absolute inset-0 scale-[0.96] opacity-70 transition-transform" style={{ transform: `translateY(14px) scale(${0.96 + Math.min(Math.abs(arrasto.x), 160) / 4000})` }}>
            <Cartao c={proxima} topo={false} />
          </div>
        )}
        <div
          key={atual.id}
          role="group"
          aria-roledescription="vaga"
          aria-label={`${atual.titulo}, combina ${atual.nota}% com você. Use as setas: direita curte, esquerda passa, para cima salva.`}
          onPointerDown={apertar}
          onPointerMove={mover}
          onPointerUp={soltar}
          onPointerCancel={soltar}
          className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
          style={{
            transform: `translate(${fora.x}px, ${fora.y}px) rotate(${giro}deg)`,
            transition: transicao,
            opacity: saindo ? 0 : 1,
          }}
        >
          <Carimbo texto="Curti" classe="left-6 -rotate-12 border-like text-like" visivel={arrasto.x / LIMIAR} />
          <Carimbo texto="Passo" classe="right-6 rotate-12 border-ink-muted text-ink-muted" visivel={-arrasto.x / LIMIAR} />
          <Carimbo texto="Salva" classe="left-1/2 -translate-x-1/2 border-ipe text-ipe" visivel={-arrasto.y / LIMIAR - Math.abs(arrasto.x) / LIMIAR} />
          <Cartao c={atual} topo />
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={voltar}
          disabled={!podeVoltar}
          aria-label="Voltar a última vaga"
          title="Voltar"
          className="flex size-11 items-center justify-center rounded-pill border border-line-strong bg-surface-200 text-ink-muted transition-colors hover:text-ink disabled:opacity-40"
        >
          <Undo2 aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => decidir("passar")}
          aria-label="Passar (seta para a esquerda)"
          title="Passar"
          className="flex size-16 items-center justify-center rounded-pill border-2 border-line-strong bg-surface-200 text-ink shadow-card transition-transform hover:scale-105 active:scale-95"
        >
          <X aria-hidden className="size-8" />
        </button>
        <button
          type="button"
          onClick={() => decidir("salvar")}
          aria-label="Salvar para depois (seta para cima)"
          title="Salvar"
          className="flex size-13 items-center justify-center rounded-pill bg-ipe text-on-ipe shadow-card transition-transform hover:scale-105 active:scale-95"
        >
          <Star aria-hidden className="size-6" fill="currentColor" />
        </button>
        <button
          type="button"
          onClick={() => decidir("curtir")}
          aria-label="Curtir (seta para a direita)"
          title="Curtir"
          className="flex size-16 items-center justify-center rounded-pill bg-like text-on-like shadow-card transition-transform hover:scale-105 active:scale-95"
        >
          <Heart aria-hidden className="size-8" fill="currentColor" />
        </button>
      </div>

      <p className="text-center text-body-sm text-ink-muted">
        {indice + 1} de {cartas.length} · deslize ou use as setas do teclado
      </p>

      {aviso && (
        <div role="status" className="mx-auto flex w-full max-w-md flex-col gap-2 rounded-md bg-surface-300 p-4 text-body-sm text-ink">
          <p>{aviso.texto}</p>
          {aviso.link && (
            <Link href={aviso.link.href} className="self-start text-label text-terra-text underline underline-offset-2">
              {aviso.link.nome}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
