"use client";

import { BadgeCheck, Building2, Check, ChevronDown, ImageUp, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Fragment, useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
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
import { ConviteNotificacoes } from "../convite-notificacoes";
import { chaveDoGrupo, EstiloDosGrupos, useGruposFechados } from "./grupos-do-menu";
import { ICONES_DO_PAINEL as ICONES } from "./icones-do-painel";
import { AjudaDoPainel } from "./ajuda-do-painel";
import { RecolherMenu } from "./recolher-menu";
import { SemLinhaDoPainel } from "./sem-linha-do-painel";

/**
 * O menu do painel, um espaço à parte (só a pessoa vê): no topo, de quem é e o que a conta faz; embaixo,
 * as seções de todas as atividades dela juntas (sem trocar de modo na tela). No computador fica na
 * coluna da esquerda, com os grupos (Atrair, Selecionar, Números, Conta) à vista e cada um fechando no nome; a
 * parte do meio rola quando a tela é baixa. No celular, os principais numa linha que rola de lado, em cima da
 * página, e os grupos no quadro do "Mais" (11/11/2026).
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
  vapid,
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
  /** quem contrata: a chave das notificações, para a linha "Candidatos no celular, na hora" no fim do menu */
  vapid?: string | null;
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
  // no celular, os grupos com nome (Atrair, Selecionar, Números, Conta) ficam atrás do "Mais", num quadro embaixo da
  // linha; a linha mostra os principais e, quando a página aberta é de um grupo, ela também (11/11/2026)
  const principais = grupos.filter((g) => !g.nome);
  const nomeados = grupos.filter((g) => g.nome);
  const abertaNoMais = nomeados.flatMap((g) => g.secoes).find((x) => x.href === ativa) ?? null;
  const [verMais, setVerMais] = useState(false);
  const idMais = useId();
  // trocou de página (um toque no quadro, um link): o quadro fecha (sem efeito, durante a renderização)
  const [deQual, setDeQual] = useState(caminho);
  if (deQual !== caminho) {
    setDeQual(caminho);
    setVerMais(false);
  }
  const linha = useRef<HTMLUListElement>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  const emPe = useRef<HTMLUListElement>(null);
  // no computador, cada grupo com nome abre e fecha (lembrado neste aparelho)
  const { fechados, alternar } = useGruposFechados();
  const idGrupos = useId();
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

  // a página aberta fica à vista: na linha do celular (rola de lado) e no menu em pé que rola (tela baixa)
  useEffect(() => {
    const nav = linha.current;
    const atual = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav && atual && nav.clientWidth > 0) {
      // onde a pílula fica dentro da linha (rolada ou não); a ponta direita fica longe do esmaecido do "Mais"
      const inicio = atual.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft;
      const fim = inicio + atual.offsetWidth;
      if (inicio < nav.scrollLeft + 16) nav.scrollLeft = Math.max(0, inicio - 16);
      else if (fim > nav.scrollLeft + nav.clientWidth - 32) nav.scrollLeft = fim - nav.clientWidth + 32;
    }
    const caixaQueRola = rolagem.current;
    const item = emPe.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (caixaQueRola && item && caixaQueRola.scrollHeight > caixaQueRola.clientHeight) {
      const c = caixaQueRola.getBoundingClientRect();
      const r = item.getBoundingClientRect();
      if (r.bottom > c.bottom || r.top < c.top) caixaQueRola.scrollTop += r.top - c.top - c.height / 3;
    }
  }, [ativa]);

  // o quadro do "Mais" fecha com Esc
  useEffect(() => {
    if (!verMais) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setVerMais(false);
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [verMais]);

  // o número de uma seção: pílula (pede ação), "N pronto(s)" (para o cliente) ou texto discreto
  function numero(s: Secao) {
    const n = s.contador ? (contadores[s.contador] ?? 0) : 0;
    const jeito = s.jeito ?? "pilula";
    if (jeito === "texto") {
      if (!s.contador || (n === 0 && !s.passo)) return null;
      return (
        <span data-menu-some className="ml-auto text-body-sm font-semibold text-ink-muted tabular-nums">
          {n}
          {s.sufixo && n > 0 ? ` ${s.sufixo}` : ""}
        </span>
      );
    }
    if (n <= 0) return null;
    if (jeito === "pronto") {
      return (
        <span
          data-menu-pilula
          className="ml-auto min-w-6 rounded-pill bg-terra-soft px-1.5 text-center text-caption leading-6 text-terra-text tabular-nums normal-case"
        >
          {n}
          <span className="sr-only"> {n === 1 ? "pronto" : "prontos"}</span>
        </span>
      );
    }
    // o que pede ação: a pílula clara terra (o painel novo, 08/11/2026)
    return (
      <span
        data-menu-pilula
        className="ml-auto min-w-6 rounded-pill bg-terra-soft px-1.5 text-center text-caption leading-6 text-terra-text tabular-nums"
      >
        {n > 99 ? "99+" : n}
        <span className="sr-only"> {n === 1 ? "novo" : "novos"}</span>
      </span>
    );
  }

  return (
    // no computador, o menu cabe na tela: o meio rola sozinho quando a tela é baixa, e o pé (a ajuda, recolher) fica à
    // vista; a ajuda abre ao lado do menu, fora da parte que rola
    <nav aria-label="Seções do painel" className="flex flex-col gap-3 lg:max-h-[calc(100dvh-6rem)] lg:gap-3">
      {/* no Hoje de quem procura trabalho, a grade faz o papel da linha no celular: some já na troca de página,
          antes de a grade chegar (o menu sabe o endereço; a página ainda está carregando) */}
      {gradeNoHoje && caminho === "/painel" && <SemLinhaDoPainel />}
      <div
        ref={rolagem}
        className="flex flex-col gap-3 lg:-mx-1 lg:min-h-0 lg:gap-5 lg:overflow-y-auto lg:overscroll-contain lg:px-1 lg:pb-3 lg:[scrollbar-width:thin]"
      >
      {/* quem é de uma equipe vê de quem é o painel e troca a conta aqui; a conta de uma pessoa só não precisa
          do quadro (o que a conta faz muda no perfil): o menu começa logo (29/10/2026) */}
      {(contas.length > 1 || papel !== "dono") && (
        <div ref={caixa} className="relative" data-menu-some>
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
          <span className="flex min-w-0 flex-col" data-menu-some>
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
            title="Publicar vaga"
            data-menu-link
            className={`flex min-h-12 items-center justify-center gap-2 rounded-md text-label transition-colors [&_svg]:size-5 ${
              caminho === "/painel"
                ? "bg-terra text-on-terra hover:bg-terra-hover"
                : "border border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
            }`}
          >
            <Plus aria-hidden />
            <span data-menu-texto>Publicar vaga</span>
          </Link>
          <div className="flex gap-1" data-menu-some>
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

      {/* no computador: os grupos em pé, todos à vista (sem "Mais ferramentas"); os com nome, um pouco mais baixos */}
      <ul ref={emPe} className="hidden flex-col gap-4 lg:flex">
        {grupos.map((g) => {
          const chave = g.nome ? chaveDoGrupo(g.nome) : undefined;
          const aberto = !chave || !fechados.includes(chave);
          // fechado, o nome do grupo ganha um ponto quando algo lá dentro pede ação (quem viu o perfil)
          const temNovo = g.secoes.some((x) => x.contador && (contadores[x.contador] ?? 0) > 0);
          return (
          <li key={`${g.atividade ?? ""}${g.nome ?? "inicio"}`} data-grupo={chave} className="flex flex-col">
            {/* com o menu recolhido (só os ícones), um traço no lugar do nome do grupo */}
            {g.nome && <span aria-hidden data-menu-traco className="mx-auto mb-2 hidden h-px w-6 bg-line-strong" />}
            {g.atividade && (
              // com mais de uma atividade: o nome dela ("Contratar")
              <p data-menu-some className="px-3 pt-1 pb-1 text-label">
                {g.atividade}
              </p>
            )}
            {g.nome && chave && (
              // o nome abre e fecha o grupo (fica lembrado neste aparelho)
              <button
                type="button"
                data-menu-some
                aria-expanded={aberto}
                aria-controls={`${idGrupos}-${chave}`}
                onClick={() => alternar(chave)}
                title={aberto ? `Fechar ${g.nome}` : `Abrir ${g.nome}`}
                className="flex min-h-8 w-full items-center gap-1.5 rounded-md px-3 text-left text-body-sm font-semibold text-ink-muted transition-colors hover:bg-surface-300 hover:text-ink"
              >
                <span className="flex-1">{g.nome}</span>
                {temNovo && (
                  <span data-so-fechado aria-hidden className="hidden size-2 rounded-pill bg-terra" />
                )}
                <ChevronDown aria-hidden data-seta className="size-4 shrink-0 transition-[rotate]" />
              </button>
            )}
            <ul
              id={chave ? `${idGrupos}-${chave}` : undefined}
              aria-label={g.nome ?? undefined}
              data-grupo-itens={chave ? "" : undefined}
              data-menu-caminho={g.caminho ? "" : undefined}
              className={`relative flex flex-col gap-0.5 ${
                // o traço que liga os passos do caminho
                g.caminho ? "before:absolute before:top-5 before:bottom-5 before:left-[22px] before:w-px before:bg-line" : ""
              }`}
            >
              {g.secoes.map((s) => (
                <li key={s.href} className="relative">
                  <ItemEmPe
                    s={s}
                    atual={ativa === s.href}
                    baixo={Boolean(g.nome)}
                    discreto={g.discreto === true}
                    falta={semCurriculo && s.href === "/perfil/curriculo"}
                    numero={numero(s)}
                  />
                </li>
              ))}
            </ul>
          </li>
          );
        })}
      </ul>
      <EstiloDosGrupos chaves={nomeados.map((g) => chaveDoGrupo(g.nome ?? ""))} />

      {/* no celular: a linha que rola de lado (os principais, a página aberta de um grupo e o "Mais") e, embaixo, o
          quadro do "Mais" com os grupos em blocos */}
      <div className="flex flex-col gap-2 lg:hidden">
        {/* o "Mais" fica sempre à vista, na ponta direita; a linha rola por baixo dele */}
        <div className="-mx-4 flex items-center">
          <ul
            ref={linha}
            // com o "Mais", o fim da linha rola para além do esmaecido (a última pílula fica toda à vista)
            className={`sem-barra flex min-w-0 flex-1 gap-1 overflow-x-auto pl-4 ${nomeados.length ? "pr-8" : "pr-4"}`}
          >
            {principais.map((g) => (
              <Fragment key={`${g.atividade ?? ""}inicio`}>
                {g.atividade && (
                  <li className="shrink-0 self-center px-1 text-caption font-semibold text-ink-muted">{g.atividade}</li>
                )}
                {g.secoes.map((s) => (
                  <li key={s.href} className="shrink-0">
                    <Pilula
                      s={s}
                      atual={ativa === s.href}
                      falta={semCurriculo && s.href === "/perfil/curriculo"}
                      // na linha curta do celular, só o número que pede ação (o "1 no ar" fica no computador)
                      numero={s.jeito === "texto" ? null : numero(s)}
                    />
                  </li>
                ))}
              </Fragment>
            ))}
            {abertaNoMais && (
              <li className="shrink-0">
                <Pilula s={abertaNoMais} atual falta={false} numero={numero(abertaNoMais)} />
              </li>
            )}
            {/* o resto do painel vem na mesma linha, mais discreto */}
            {outras.map((o) => (
              <li key={o.href} className="shrink-0">
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
          {nomeados.length > 0 && (
            <div className="relative shrink-0 pr-4 pl-1">
              {/* a ponta da linha esmaece embaixo do "Mais" (tem mais pílulas para o lado) */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-full w-6 bg-gradient-to-l from-surface-100 to-transparent"
              />
              <button
                type="button"
                aria-expanded={verMais}
                aria-controls={idMais}
                onClick={() => setVerMais((v) => !v)}
                className={`relative flex min-h-11 items-center gap-1 rounded-pill border px-3.5 text-label whitespace-nowrap transition-colors ${
                  verMais ? "border-ink bg-surface-300 text-ink" : "border-line-strong bg-surface-100 text-ink hover:bg-surface-300"
                }`}
              >
                Mais
                {/* o que pede ação lá dentro (quem viu o perfil) */}
                {!verMais && nomeados.some((g) => g.secoes.some((x) => x.contador && (contadores[x.contador] ?? 0) > 0)) && (
                  <>
                    <span aria-hidden className="size-2 rounded-pill bg-terra" />
                    <span className="sr-only">, com novidade</span>
                  </>
                )}
                <ChevronDown aria-hidden className={`size-4 transition-transform ${verMais ? "rotate-180" : ""}`} />
              </button>
            </div>
          )}
        </div>
        {verMais && (
          <div id={idMais} className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-3 shadow-card">
            {nomeados.map((g) => (
              <div key={g.nome} className="flex flex-col gap-1.5">
                <p className="px-1 text-body-sm font-semibold text-ink-muted">{g.nome}</p>
                <ul aria-label={g.nome ?? undefined} className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {g.secoes.map((s) => (
                    <li key={s.href}>
                      <Bloco s={s} atual={ativa === s.href} numero={numero(s)} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      {publicar && vapid !== undefined && (
        <div className="hidden lg:block" data-menu-some>
          <ConviteNotificacoes
            vapid={vapid}
            jeito="linha"
            titulo="Saiba na hora quando alguém se candidatar"
            texto="Candidatos no celular, na hora"
          />
        </div>
      )}

      <div data-menu-some className={`hidden flex-col gap-1 border-t border-line pt-3 ${outras.length ? "lg:flex" : ""}`}>
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
        {/* no computador, com a tela baixa: o fim da parte que rola esmaece (tem mais embaixo); no fim, cobre só o
            espaço vazio do pé */}
        <div
          aria-hidden
          className="pointer-events-none sticky bottom-0 -mt-8 hidden h-8 shrink-0 bg-gradient-to-t from-surface-100 to-transparent lg:block"
        />
      </div>
      {/* o pé do menu: a ajuda da página (só quem contrata) e, no computador, recolher o menu (só os ícones) */}
      <div className="flex flex-col gap-0.5 lg:border-t lg:border-line lg:pt-3">
        {tipoConta && tipoConta !== "pessoa" && <AjudaDoPainel agencia={tipoConta === "agencia"} />}
        <RecolherMenu />
      </div>
    </nav>
  );
}

/** O "Novo" ao lado do nome da ferramenta nova (o Mutirão). */
function SeloNovo({ escuro }: { escuro: boolean }) {
  return (
    <span
      data-menu-some
      className={`ml-auto shrink-0 rounded-pill border px-1.5 text-[11px] leading-[18px] font-semibold ${
        escuro ? "border-surface-100/40 text-surface-100" : "border-line-strong text-ink-muted"
      }`}
    >
      Novo
    </span>
  );
}

/** Um item do menu em pé (computador). `baixo`: dos grupos com nome; `discreto`: o grupo do fim (Conta). */
function ItemEmPe({
  s,
  atual,
  baixo,
  discreto,
  falta,
  numero,
}: {
  s: Secao;
  atual: boolean;
  baixo: boolean;
  discreto: boolean;
  falta: boolean;
  numero: ReactNode;
}) {
  const Icone = ICONES[s.icone];
  return (
    <Link
      href={s.href}
      aria-current={atual ? "page" : undefined}
      title={s.nome}
      data-menu-link
      className={`relative flex items-center gap-2.5 rounded-md px-3 transition-colors ${baixo ? "min-h-9" : "min-h-10"} ${
        discreto ? "text-body-sm font-semibold" : "text-label"
      } ${
        atual
          ? "bg-ink text-surface-100"
          : discreto
            ? "text-ink-muted hover:bg-surface-300 hover:text-ink"
            : "text-ink hover:bg-surface-300"
      }`}
    >
      {s.passo ? (
        <span
          aria-hidden
          className={`relative grid size-[22px] shrink-0 place-items-center rounded-pill text-[12px] font-bold tabular-nums ${
            atual ? "bg-ink text-surface-100" : "border-[1.5px] border-line-strong bg-surface-100 text-ink-muted"
          }`}
        >
          {s.passo}
        </span>
      ) : (
        <Icone aria-hidden className="size-5 shrink-0" />
      )}
      <span data-menu-texto className={`flex min-w-0 flex-1 flex-col ${s.cortesia ? "py-1.5" : ""}`}>
        <span>
          {s.passo && <span className="sr-only">Passo {s.passo}: </span>}
          {s.nome}
        </span>
        {/* os dias grátis numa linha de texto embaixo do nome (o painel novo) */}
        {s.cortesia && (
          <span className={`text-[12px] leading-4 font-normal ${atual ? "text-surface-100/80" : "text-ink-muted"}`}>
            {textoDaCortesia(s.cortesia)}
          </span>
        )}
      </span>
      {s.novo && <SeloNovo escuro={atual} />}
      {falta && <PilulaFaltaCurriculo />}
      {numero}
    </Link>
  );
}

/** Uma pílula da linha do celular (os principais e a página aberta de um grupo). */
function Pilula({ s, atual, falta, numero }: { s: Secao; atual: boolean; falta: boolean; numero: ReactNode }) {
  const Icone = ICONES[s.icone];
  return (
    <Link
      href={s.href}
      aria-current={atual ? "page" : undefined}
      className={`relative flex min-h-11 items-center gap-2 rounded-pill px-3 text-label whitespace-nowrap transition-colors ${
        atual ? "bg-ink text-surface-100" : "border border-line-strong text-ink hover:bg-surface-300"
      }`}
    >
      <Icone aria-hidden className="size-[18px] shrink-0" />
      <span>{s.nome}</span>
      {falta && <PilulaFaltaCurriculo />}
      {numero}
    </Link>
  );
}

/** Um bloco do quadro do "Mais", no celular: o ícone, o nome e, embaixo, os dias grátis. */
function Bloco({ s, atual, numero }: { s: Secao; atual: boolean; numero: ReactNode }) {
  const Icone = ICONES[s.icone];
  return (
    <Link
      href={s.href}
      aria-current={atual ? "page" : undefined}
      className={`relative flex h-full min-h-12 items-center gap-2.5 rounded-md px-3 py-2 transition-colors ${
        atual ? "bg-ink text-surface-100" : "bg-surface-100 text-ink hover:bg-surface-300"
      }`}
    >
      <Icone aria-hidden className="size-5 shrink-0" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-label">{s.nome}</span>
        {s.cortesia && (
          <span className={`text-[12px] leading-4 ${atual ? "text-surface-100/80" : "text-ink-muted"}`}>
            {textoDaCortesia(s.cortesia)}
          </span>
        )}
      </span>
      {s.novo && <SeloNovo escuro={atual} />}
      {numero}
    </Link>
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
