"use client";

import { ArrowRight, Eye, Power, Search, Share2, Sparkles, Trash2, X, type LucideIcon } from "lucide-react";
import { startTransition, useActionState, useMemo, useState, type FormEvent } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { apagarBanner, ligarBanner, salvarBanner } from "@/lib/acoes/admin-banners";
import { ACOES_BANNER, palavraDoLink, PUBLICOS_BANNER, type AcaoBanner, type PublicoBanner } from "@/lib/banners";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { Campo, classesEntrada, ligarCampo, Seletor } from "../ui/campo";
import { useAcao } from "../ui/usar-acao";

/** Um banner para editar (as datas já em "2026-10-25", no dia de Brasília). */
export type BannerParaEditar = {
  id: string;
  titulo: string;
  texto: string | null;
  botao: string;
  acao: AcaoBanner;
  link: string | null;
  publico: PublicoBanner;
  repetir_dias: number | null;
  ativo: boolean;
  inicio: string;
  fim: string;
};

const BOTAO_SUGERIDO: Record<AcaoBanner, string> = {
  novas: "Ver as vagas novas",
  busca: "Ver as vagas",
  link: "Ver agora",
  compartilhar: "Compartilhar",
};

const ICONES: Record<AcaoBanner, LucideIcon> = {
  novas: Sparkles,
  busca: Search,
  link: ArrowRight,
  compartilhar: Share2,
};

/** Criar (sem `banner`) ou editar um banner, com a prévia de como fica a janela. */
export function FormBanner({ banner }: { banner?: BannerParaEditar }) {
  const id = banner?.id ?? null;
  const salvarProtegido = useMemo(() => protegerAcao(salvarBanner.bind(null, id)), [id]);
  const [estado, acao, enviando] = useActionState(salvarProtegido, {
    ok: false,
  } as EstadoForm);
  const erros = estado.erros ?? {};
  const [tipo, setTipo] = useState<AcaoBanner>(banner?.acao ?? "novas");
  const [titulo, setTitulo] = useState(banner?.titulo ?? "");
  const [texto, setTexto] = useState(banner?.texto ?? "");
  const [botao, setBotao] = useState(banner?.botao ?? BOTAO_SUGERIDO.novas);
  // o texto do botão acompanha a ação enquanto ninguém mexeu nele
  const [botaoMexido, setBotaoMexido] = useState(Boolean(banner));
  const [repetir, setRepetir] = useState(banner?.repetir_dias != null);

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => acao(dados));
  }

  const Icone = ICONES[tipo];
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
        {estado.erro && (
          <Aviso tipo="erro" titulo="Não deu para salvar">
            {estado.erro}
          </Aviso>
        )}
        <Campo rotulo="Título" nome="titulo" erro={erros.titulo}>
          <input
            {...ligarCampo("titulo", erros.titulo)}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            maxLength={80}
            placeholder="Vagas novas perto de você"
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Texto" nome="texto" opcional erro={erros.texto} ajuda="Uma ou duas frases. Até 240 letras.">
          <textarea
            {...ligarCampo("texto", erros.texto, true)}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            maxLength={240}
            rows={3}
            placeholder="Entraram vagas hoje no seu bairro. Veja antes de todo mundo."
            className={classesEntrada}
          />
        </Campo>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-label">O que o botão faz</legend>
          {(Object.keys(ACOES_BANNER) as AcaoBanner[]).map((a) => (
            <label
              key={a}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-line px-3 has-checked:border-ink"
            >
              <input
                type="radio"
                name="acao"
                value={a}
                checked={tipo === a}
                onChange={() => {
                  setTipo(a);
                  if (!botaoMexido) setBotao(BOTAO_SUGERIDO[a]);
                }}
                className="size-4 accent-[var(--pk-ink)]"
              />
              <span className="text-body">{ACOES_BANNER[a]}</span>
            </label>
          ))}
        </fieldset>
        {tipo === "busca" && (
          <Campo rotulo="O que buscar" nome="palavra" erro={erros.palavra} ajuda="A busca de vagas por essa palavra.">
            <input
              {...ligarCampo("palavra", erros.palavra, true)}
              defaultValue={palavraDoLink(banner?.acao === "busca" ? banner.link : null)}
              maxLength={60}
              placeholder="garçom"
              className={classesEntrada}
            />
          </Campo>
        )}
        {tipo === "link" && (
          <Campo
            rotulo="Endereço da página"
            nome="caminho"
            erro={erros.caminho}
            ajuda="Só páginas do Publike, começando com /. Ex.: /vagas/goiania ou /talentos."
          >
            <input
              {...ligarCampo("caminho", erros.caminho, true)}
              defaultValue={banner?.acao === "link" ? (banner.link ?? "") : ""}
              maxLength={300}
              placeholder="/vagas/goiania"
              className={classesEntrada}
            />
          </Campo>
        )}
        {tipo === "compartilhar" && (
          <p className="text-body-sm text-ink-muted">
            No celular, abre o compartilhar do aparelho (WhatsApp, Instagram…); no computador, copia o link. Tem também
            “Mandar no WhatsApp”. Quem criar conta por esse link aparece em Campanhas como compartilhar:banner.
          </p>
        )}
        <Campo rotulo="Texto do botão" nome="botao" erro={erros.botao}>
          <input
            {...ligarCampo("botao", erros.botao)}
            value={botao}
            onChange={(e) => {
              setBotao(e.target.value);
              setBotaoMexido(true);
            }}
            maxLength={30}
            className={classesEntrada}
          />
        </Campo>
        <Campo rotulo="Quem vê" nome="publico" erro={erros.publico}>
          <Seletor
            {...ligarCampo("publico", erros.publico)}
            defaultValue={banner?.publico ?? "todos"}
            className={classesEntrada}
          >
            {(Object.keys(PUBLICOS_BANNER) as PublicoBanner[]).map((p) => (
              <option key={p} value={p}>
                {PUBLICOS_BANNER[p]}
              </option>
            ))}
          </Seletor>
        </Campo>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-label">Quantas vezes aparece</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-line px-3 has-checked:border-ink">
            <input
              type="radio"
              name="repetir"
              value="uma"
              checked={!repetir}
              onChange={() => setRepetir(false)}
              className="size-4 accent-[var(--pk-ink)]"
            />
            <span className="text-body">Só uma vez para cada pessoa</span>
          </label>
          <label className="flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border border-line px-3 py-2 has-checked:border-ink">
            <input
              type="radio"
              name="repetir"
              value="dias"
              checked={repetir}
              onChange={() => setRepetir(true)}
              className="size-4 accent-[var(--pk-ink)]"
            />
            <span className="text-body">De novo a cada</span>
            <input
              type="number"
              name="repetir_dias"
              aria-label="Dias até aparecer de novo"
              aria-invalid={erros.repetir_dias ? true : undefined}
              min={1}
              max={90}
              defaultValue={banner?.repetir_dias ?? 7}
              disabled={!repetir}
              className={classesEntrada.replace("w-full", "w-20")}
            />
            <span className="text-body">dias, até a pessoa tocar no botão</span>
          </label>
          {erros.repetir_dias ? (
            <p className="text-body-sm text-danger">{erros.repetir_dias}</p>
          ) : (
            <p className="text-body-sm text-ink-muted">
              Quem tem conta vê uma vez na conta, em qualquer aparelho; quem não tem, uma vez em cada navegador.
            </p>
          )}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Começa em" nome="inicio" opcional erro={erros.inicio} ajuda="Vazio: já.">
            <input
              {...ligarCampo("inicio", erros.inicio, true)}
              type="date"
              defaultValue={banner?.inicio ?? ""}
              className={classesEntrada}
            />
          </Campo>
          <Campo
            rotulo="Termina em"
            nome="fim"
            opcional
            erro={erros.fim}
            ajuda="Vale até o fim do dia. Vazio: sem fim."
          >
            <input
              {...ligarCampo("fim", erros.fim, true)}
              type="date"
              defaultValue={banner?.fim ?? ""}
              className={classesEntrada}
            />
          </Campo>
        </div>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="ativo"
            defaultChecked={banner?.ativo ?? true}
            className="size-5 accent-[var(--pk-ink)]"
          />
          <span className="text-body">Ligado (aparece na página inicial)</span>
        </label>
        <div>
          <Botao type="submit" variante="primario" disabled={enviando}>
            {enviando ? "Salvando…" : banner ? "Salvar o banner" : "Criar o banner"}
          </Botao>
        </div>
      </form>

      {/* a prévia: como a janela aparece no site */}
      <div className="flex flex-col gap-2 lg:sticky lg:top-24">
        <p className="flex items-center gap-1.5 text-label text-ink-muted">
          <Eye aria-hidden className="size-4" />
          Prévia
        </p>
        <div aria-hidden className="rounded-lg bg-veu p-4">
          <div className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface-200 p-5 shadow-raised">
            <div className="flex items-start justify-between">
              <span className="flex size-10 items-center justify-center rounded-pill bg-terra-soft text-terra-text">
                <Icone className="size-5" />
              </span>
              <X className="size-5 text-ink-muted" />
            </div>
            <div>
              <p className="text-h3 text-balance">{titulo || "Título do banner"}</p>
              {texto && <p className="mt-1.5 text-body-sm whitespace-pre-line text-ink-muted">{texto}</p>}
            </div>
            <span className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-terra px-4 text-label text-on-terra">
              {botao || "Botão"}
            </span>
            {tipo === "compartilhar" && (
              <span className="text-center text-label text-ink-muted underline underline-offset-2">
                Mandar no WhatsApp
              </span>
            )}
            <span className="text-center text-label text-ink-muted">Agora não</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Ligar, desligar e apagar (apagar pede um segundo toque). */
export function AcoesBanner({ id, ativo }: { id: string; ativo: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex flex-wrap gap-2">
        <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(() => ligarBanner(id, !ativo))}>
          <Power aria-hidden />
          {ativo ? "Desligar" : "Ligar"}
        </Botao>
        {confirmar ? (
          <>
            <Botao tamanho="sm" variante="perigo" disabled={pendente} onClick={() => rodar(() => apagarBanner(id))}>
              <Trash2 aria-hidden />
              Apagar de vez
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(false)}>
              Cancelar
            </Botao>
          </>
        ) : (
          <Botao tamanho="sm" variante="fantasma" onClick={() => setConfirmar(true)}>
            <Trash2 aria-hidden />
            Apagar
          </Botao>
        )}
      </div>
      {mensagem}
    </div>
  );
}
