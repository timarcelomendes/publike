"use client";

import { BadgeCheck, Building2, Check, ChevronDown, ImageUp, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { trocarConta } from "@/lib/acoes/equipe";
import { PAPEIS_EQUIPE, type ContaDisponivel, type PapelNaConta } from "@/lib/equipe";
import {
  gruposDaConta,
  outrasDaConta,
  secaoAtiva,
  textoDoQueFaz,
  type Contadores,
  type ExtrasDoMenu,
  type ModoPainel,
  type Secao,
} from "@/lib/modo-painel";
import { SELO_CORTESIA_CURTO } from "@/lib/cortesia";
import { PilulaFaltaCurriculo } from "../curriculo/sem-curriculo";
import { Avatar } from "../ui/basicos";
import { ICONES_DO_PAINEL as ICONES } from "./icones-do-painel";
import { SemLinhaDoPainel } from "./sem-linha-do-painel";

/**
 * O menu do painel, um espaço à parte (só a pessoa vê): no topo, de quem é e o que a conta faz; embaixo,
 * as seções de todas as atividades dela juntas (sem trocar de modo na tela). No computador fica na
 * coluna da esquerda; no celular, numa linha que rola de lado, em cima da página.
 */
export function MenuPainel({
  atividades: recebidas,
  contadores,
  nome,
  tipoConta = null,
  contas = [],
  papel = "dono",
  gradeNoHoje = false,
  copiloto = false,
  pilulas,
  semCurriculo = false,
  conta = null,
  publicar = null,
}: {
  /** o que a conta faz (a principal primeiro): o menu mostra todas juntas, sem troca de modo */
  atividades: ModoPainel[];
  contadores: Contadores;
  nome: string | null;
  /** o tipo da conta (agência ganha "Clientes" e "Equipe" em Contratar) */
  tipoConta?: string | null;
  /** as contas pelas quais a pessoa pode agir (a dela e as das equipes): com mais de uma, dá para trocar */
  contas?: ContaDisponivel[];
  /** o papel na conta atual (quem é da equipe age pela agência) */
  papel?: PapelNaConta;
  /** o Hoje é a grade das seções (quem procura trabalho): lá, no celular, a linha do menu sai */
  gradeNoHoje?: boolean;
  /** o copiloto (em teste) liberado para a conta: entra em "Achar gente" */
  copiloto?: boolean;
  /** as pílulas do Copiloto e dos Testes pelo estado da conta ("15 dias grátis", "faltam N dias", nada) */
  pilulas?: ExtrasDoMenu["pilulas"];
  /** quem procura trabalho sem currículo: "Falta" ao lado de Currículo */
  semCurriculo?: boolean;
  /** quem contrata: a conta no alto do menu (no computador), com o tipo, o bairro, o selo e a equipe */
  conta?: { nome: string; foto: string | null; tipo: string; bairro: string | null; verificado: boolean; equipe: number | null } | null;
  /** quem contrata: o "Publicar vaga" no alto do menu (no computador), com "pela foto" e, na agência, "Novo cliente" */
  publicar?: { foto: boolean; agencia: boolean } | null;
}) {
  const caminho = usePathname() ?? "/painel";
  const busca = useSearchParams();
  const tipo = busca?.get("tipo") ?? null;
  const router = useRouter();
  // uma aba aberta desde antes de uma versão nova do site pode trazer o menu antigo sem a lista
  // (o erro "atividades.length" no navegador): sem ela, vale o menu de quem procura trabalho
  const atividades: ModoPainel[] = Array.isArray(recebidas) ? recebidas : ["trabalhar"];
  // todas as atividades da conta juntas, sem troca de modo na tela
  const grupos = gruposDaConta(atividades, tipoConta, { copiloto, pilulas });
  const outras = outrasDaConta(atividades, grupos);
  const ativa = secaoAtiva(grupos, outras, caminho, tipo);
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const idMenu = useId();
  const [trocando, iniciarTroca] = useTransition();
  const [erroTroca, setErroTroca] = useState<string | null>(null);

  function agirComo(conta: ContaDisponivel) {
    if (conta.atual) return setAberto(false);
    setErroTroca(null);
    iniciarTroca(async () => {
      const r = await trocarConta(conta.conta_id);
      if (!r.ok) {
        if (r.ir) router.push(r.ir);
        return setErroTroca(r.erro);
      }
      setAberto(false);
      if (caminho !== "/") router.push("/painel");
      router.refresh();
    });
  }

  // a lista das contas (agir como) fecha ao tocar fora e com Esc
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  // o número de uma seção: pílula (pede ação), "N pronto(s)" (para o cliente) ou texto discreto
  function numero(s: Secao) {
    const n = s.contador ? (contadores[s.contador] ?? 0) : 0;
    const jeito = s.jeito ?? "pilula";
    if (jeito === "texto") {
      if (!s.contador || (n === 0 && !s.passo)) return null;
      return (
        <span className="ml-auto text-body-sm font-semibold text-ink-muted tabular-nums">
          {n}
          {s.sufixo && n > 0 ? ` ${s.sufixo}` : ""}
        </span>
      );
    }
    if (n <= 0) return null;
    if (jeito === "pronto") {
      return (
        <span className="ml-auto min-w-6 rounded-pill bg-terra-soft px-1.5 text-center text-caption leading-6 text-terra-text tabular-nums normal-case">
          {n}
          <span className="sr-only"> {n === 1 ? "pronto" : "prontos"}</span>
        </span>
      );
    }
    // o que pede ação: a pílula clara terra (o painel novo, 08/11/2026)
    return (
      <span className="ml-auto min-w-6 rounded-pill bg-terra-soft px-1.5 text-center text-caption leading-6 text-terra-text tabular-nums">
        {n > 99 ? "99+" : n}
        <span className="sr-only"> novos</span>
      </span>
    );
  }

  return (
    <nav aria-label="Seções do painel" className="flex flex-col gap-3 lg:gap-5">
      {/* no Hoje de quem procura trabalho, a grade faz o papel da linha no celular: some já na troca de página,
          antes de a grade chegar (o menu sabe o endereço; a página ainda está carregando) */}
      {gradeNoHoje && caminho === "/painel" && <SemLinhaDoPainel />}
      {/* quem é de uma equipe vê de quem é o painel e troca a conta aqui; a conta de uma pessoa só não precisa
          do quadro (o que a conta faz muda no perfil): o menu começa logo (29/10/2026) */}
      {(contas.length > 1 || papel !== "dono") && (
        <div ref={caixa} className="relative">
          <div className="flex min-h-14 w-full items-center gap-3 rounded-md border border-line-strong bg-surface-200 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-caption text-ink-muted">
                Seu painel · só você vê
                {papel !== "dono" && ` · ${PAPEIS_EQUIPE[papel].nome}`}
              </span>
              {nome && <span className="block truncate text-label">{nome}</span>}
              {atividades.length > 0 && (
                <span className="block text-body-sm text-ink-muted">{textoDoQueFaz(atividades)}</span>
              )}
            </span>
            {contas.length > 1 ? (
              <button
                type="button"
                aria-expanded={aberto}
                aria-controls={idMenu}
                onClick={() => setAberto((a) => !a)}
                className="flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-body-sm text-ink-muted hover:bg-surface-300 hover:text-ink"
              >
                Agir como
                <ChevronDown aria-hidden className={`size-4 transition-transform ${aberto ? "rotate-180" : ""}`} />
              </button>
            ) : papel === "dono" || papel === "admin" ? (
              <Link
                href="/perfil#modos"
                className="shrink-0 text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Mudar
                <span className="sr-only"> o que você faz no Publike</span>
              </Link>
            ) : null}
          </div>
          {aberto && (
            <div
              id={idMenu}
              className="absolute top-full right-0 left-0 z-40 mt-1 rounded-md border border-line-strong bg-surface-200 py-1 shadow-raised"
            >
              <ul aria-label="Contas" className="pb-1">
                {contas.map((c) => (
                  <li key={c.conta_id}>
                    <button
                      type="button"
                      aria-current={c.atual ? "true" : undefined}
                      disabled={trocando}
                      onClick={() => agirComo(c)}
                      className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-300 disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-label">{c.nome}</span>
                        <span className="block text-body-sm text-ink-muted">
                          {c.papel === "dono" ? "Sua conta" : `Equipe · ${PAPEIS_EQUIPE[c.papel].nome}`}
                        </span>
                      </span>
                      {c.atual && <Check aria-hidden className="size-5 shrink-0 text-cerrado-text" />}
                    </button>
                  </li>
                ))}
              </ul>
              {erroTroca && (
                <p role="alert" className="px-4 py-2 text-body-sm text-danger">
                  {erroTroca}
                </p>
              )}
              {(papel === "dono" || papel === "admin") && (
                <Link
                  href="/perfil#modos"
                  onClick={() => setAberto(false)}
                  className="flex min-h-11 items-center border-t border-line px-4 text-body-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                >
                  Escolher o que você faz no Publike
                </Link>
              )}
            </div>
          )}
        </div>
      )}

      {/* quem contrata, no computador: a conta e o "Publicar vaga" no alto do menu (o painel novo, 08/11/2026) */}
      {conta && contas.length <= 1 && papel === "dono" && (
        <div className="hidden items-center gap-3 lg:flex">
          {conta.foto ? (
            <Avatar nome={conta.nome} foto={conta.foto} forma="quadrada" tamanho={44} />
          ) : (
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-md bg-ink font-display text-body font-extrabold text-surface-100"
            >
              {iniciais(conta.nome)}
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 text-label">
              <span className="truncate">{conta.nome}</span>
              {conta.verificado && (
                <BadgeCheck role="img" aria-label="Verificada" className="size-4 shrink-0 text-cerrado-text" />
              )}
            </span>
            {conta.equipe !== null && conta.equipe > 1 ? (
              <Link href="/painel/equipe" className="text-body-sm text-ink-muted hover:text-ink hover:underline">
                {conta.tipo} · {conta.equipe} na equipe
              </Link>
            ) : (
              <span className="truncate text-body-sm text-ink-muted">
                {conta.tipo}
                {conta.bairro ? ` · ${conta.bairro}` : ""}
              </span>
            )}
          </span>
        </div>
      )}
      {publicar && (
        <div className="hidden flex-col gap-1 lg:flex">
          {/* no Hoje é o botão terra da tela; nas outras páginas do painel, com contorno (um terra por tela) */}
          <Link
            href="/publicar"
            className={`flex min-h-12 items-center justify-center gap-2 rounded-md text-label transition-colors [&_svg]:size-5 ${
              caminho === "/painel"
                ? "bg-terra text-on-terra hover:bg-terra-hover"
                : "border border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
            }`}
          >
            <Plus aria-hidden />
            Publicar vaga
          </Link>
          <div className="flex gap-1">
            {publicar.agencia && (
              <Link
                href="/painel/clientes/novo"
                className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md text-body-sm font-semibold text-ink hover:bg-surface-300"
              >
                <Building2 aria-hidden className="size-[18px]" />
                Novo cliente
              </Link>
            )}
            {publicar.foto && (
              <Link
                href="/publicar#arte"
                title="Mande a arte da vaga (o post ou o cartaz) e o Publike preenche tudo"
                className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-md text-body-sm font-semibold text-ink hover:bg-surface-300"
              >
                <ImageUp aria-hidden className="size-[18px]" />
                {publicar.agencia ? "Pela foto" : "Publicar pela foto"}
              </Link>
            )}
          </div>
        </div>
      )}

      <ul className="sem-barra -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:gap-4 lg:overflow-visible lg:px-0">
        {grupos.map((g) => (
          <li key={`${g.atividade ?? ""}${g.nome ?? "inicio"}`} className="contents lg:block">
            {g.atividade && (
              // com mais de uma atividade: o nome dela ("Contratar"), também na faixa do celular
              <p className="shrink-0 self-center px-1 text-caption font-semibold text-ink-muted lg:px-3 lg:pt-1 lg:pb-1 lg:text-label lg:text-ink">
                {g.atividade}
              </p>
            )}
            {g.nome && (
              <p className="hidden px-3 pb-1.5 text-body-sm font-semibold text-ink-muted lg:block">{g.nome}</p>
            )}
            <ul
              className={`contents lg:relative lg:flex lg:flex-col lg:gap-0.5 ${
                // o traço que liga os passos do caminho
                g.caminho
                  ? "lg:before:absolute lg:before:top-5 lg:before:bottom-5 lg:before:left-[22px] lg:before:w-px lg:before:bg-line"
                  : ""
              }`}
            >
              {(() => {
                // o menu com 4 itens fixos (08/11/2026): no computador, o resto do grupo fica em "Mais ferramentas"
                const item = (s: (typeof g.secoes)[number], soNoCelular = false) => {
                const Icone = ICONES[s.icone];
                const atualSecao = ativa === s.href;
                return (
                  <li key={s.href} className={`relative shrink-0 ${soNoCelular ? "lg:hidden" : ""}`}>
                    <Link
                      href={s.href}
                      aria-current={atualSecao ? "page" : undefined}
                      className={`relative flex min-h-11 items-center gap-2.5 rounded-pill px-3.5 text-label whitespace-nowrap transition-colors lg:min-h-10 lg:rounded-md lg:px-3 ${
                        atualSecao
                          ? "bg-ink text-surface-100"
                          : "border border-line-strong text-ink hover:bg-surface-300 lg:border-transparent"
                      }`}
                    >
                      {s.passo ? (
                        // o número do passo só no computador (o caminho em pé); na pílula do celular, o ícone,
                        // para a pílula ter um número só (a contagem)
                        <>
                          <Icone aria-hidden className="size-5 shrink-0 lg:hidden" />
                          <span
                            aria-hidden
                            className={`hidden size-[22px] shrink-0 place-items-center rounded-pill text-[12px] font-bold tabular-nums lg:relative lg:grid ${
                              atualSecao
                                ? "bg-surface-100 text-ink lg:bg-ink lg:text-surface-100"
                                : "border-[1.5px] border-line-strong bg-surface-100 text-ink-muted"
                            }`}
                          >
                            {s.passo}
                          </span>
                        </>
                      ) : (
                        <Icone aria-hidden className="size-5 shrink-0" />
                      )}
                      <span className={`flex flex-col ${s.passo ? "" : "lg:flex-1"}`}>
                        <span>
                          {s.passo && <span className="sr-only">Passo {s.passo}: </span>}
                          {s.nome}
                        </span>
                        {/* os dias grátis numa linha de texto, sem o selo amarelo (o painel novo) */}
                        {s.cortesia && (
                          <span
                            className={`hidden text-[12px] leading-4 font-normal lg:block ${
                              atualSecao ? "text-surface-100/80" : "text-ink-muted"
                            }`}
                          >
                            {textoDaCortesia(s.cortesia)}
                          </span>
                        )}
                      </span>
                      {semCurriculo && s.href === "/perfil/curriculo" && <PilulaFaltaCurriculo />}
                      {numero(s)}
                    </Link>
                  </li>
                );
              };
                const fixas = g.secoes.filter((x) => !x.mais);
                const mais = g.secoes.filter((x) => x.mais);
                const maisAtiva = mais.some((x) => x.href === ativa);
                return (
                  <>
                    {fixas.map((x) => item(x))}
                    {mais.map((x) => item(x, true))}
                    {mais.length > 0 && (
                      <li className="hidden lg:block">
                        <details open={maisAtiva} className="group">
                          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2.5 rounded-md px-3 text-label text-ink-muted hover:bg-surface-300 hover:text-ink [&::-webkit-details-marker]:hidden">
                            <ChevronDown aria-hidden className="size-5 shrink-0 transition-transform group-open:rotate-180" />
                            <span className="flex-1">Mais ferramentas</span>
                            <span className="text-body-sm tabular-nums">{mais.length}</span>
                          </summary>
                          <ul className="mt-0.5 flex flex-col gap-0.5">{mais.map((x) => item(x))}</ul>
                        </details>
                      </li>
                    )}
                  </>
                );
              })()}
            </ul>
          </li>
        ))}
        {/* no celular, o resto do painel vem na mesma linha, mais discreto */}
        {outras.map((o) => (
          <li key={o.href} className="shrink-0 lg:hidden">
            <Link
              href={o.href}
              aria-current={ativa === o.href ? "page" : undefined}
              className={`flex min-h-11 items-center rounded-pill px-3.5 text-body-sm whitespace-nowrap ${
                ativa === o.href ? "bg-ink text-surface-100" : "text-ink-muted underline underline-offset-2"
              }`}
            >
              {o.nome}
            </Link>
          </li>
        ))}
      </ul>

      <div className={`hidden flex-col gap-1 border-t border-line pt-3 ${outras.length ? "lg:flex" : ""}`}>
        <p className="px-3 text-body-sm font-semibold text-ink-muted">Mais</p>
        <ul className="flex flex-col">
          {outras.map((o) => (
            <li key={o.href}>
              <Link
                href={o.href}
                aria-current={ativa === o.href ? "page" : undefined}
                className={`flex min-h-10 items-center rounded-md px-3 text-body-sm transition-colors hover:bg-surface-300 ${
                  ativa === o.href ? "bg-surface-300 font-semibold text-ink" : "text-ink-muted"
                }`}
              >
                {o.nome}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

/** As iniciais da conta, no quadrado do alto do menu ("Panificadora Bom Gosto" → "PB"). */
function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p));
  const letras = (partes.length > 1 ? [partes[0], partes[partes.length - 1]] : [nome.trim()]).map((p) => p[0] ?? "");
  return letras.join("").toUpperCase() || "?";
}

/** Os dias grátis de um recurso, como texto ("faltam 10 dias grátis", "15 dias grátis"). */
function textoDaCortesia(c: boolean | string) {
  if (typeof c !== "string") return SELO_CORTESIA_CURTO;
  return c.startsWith("falta") ? `${c} grátis` : c;
}

/** O menu enquanto o servidor ainda lê a conta: o mesmo tamanho, sem números. */
export function MenuPainelEsqueleto() {
  return (
    <div aria-hidden className="flex flex-col gap-3 lg:gap-5">
      <div className="h-14 animate-pulse rounded-md bg-surface-300" />
      <div className="flex gap-2 overflow-hidden lg:flex-col">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-11 w-32 shrink-0 animate-pulse rounded-md bg-surface-300 lg:w-full" />
        ))}
      </div>
    </div>
  );
}
