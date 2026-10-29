"use client";

import { ArrowRight, Eye, ImagePlus, Power, Search, Share2, Sparkles, Trash2, X, type LucideIcon } from "lucide-react";
import { startTransition, useActionState, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { apagarBanner, ligarBanner, salvarBanner } from "@/lib/acoes/admin-banners";
import {
  ACOES_BANNER,
  PAGINAS_BANNER,
  palavraDoLink,
  PUBLICOS_BANNER,
  type AcaoBanner,
  type PaginaBanner,
  type PublicoBanner,
} from "@/lib/banners";
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
  paginas: PaginaBanner[];
  atraso_segundos: number;
  busca_da_area: boolean;
  /** a imagem do alto da janela (Storage) */
  imagem: string | null;
};

/**
 * A imagem escolhida, menor (JPG de até 1600 px), antes de ir para o servidor: a ação aceita 1 MB. O
 * servidor ajusta de novo (WebP de até 1200 px) e guarda.
 */
async function imagemMenor(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(bitmap.width * escala);
  tela.height = Math.round(bitmap.height * escala);
  tela.getContext("2d")?.drawImage(bitmap, 0, 0, tela.width, tela.height);
  bitmap.close();
  for (const qualidade of [0.86, 0.75, 0.6]) {
    const blob = await new Promise<Blob | null>((r) => tela.toBlob(r, "image/jpeg", qualidade));
    if (blob && blob.size <= 900 * 1024) return blob;
  }
  throw new Error("grande demais");
}

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
  const [daArea, setDaArea] = useState(banner?.busca_da_area ?? false);
  // a imagem: a que já está salva, ou a escolhida agora (só a prévia no navegador)
  const [imagemSalva, setImagemSalva] = useState(banner?.imagem ?? null);
  const [escolhida, setEscolhida] = useState<{ arquivo: File; previa: string } | null>(null);
  const [erroImagem, setErroImagem] = useState<string | null>(null);
  const imagemNaPrevia = escolhida?.previa ?? imagemSalva;

  function escolherImagem(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    setErroImagem(null);
    if (!arquivo) return;
    if (!/^image\/(png|jpeg|webp)$/.test(arquivo.type)) return setErroImagem("Escolha uma imagem PNG, JPG ou WebP.");
    if (escolhida) URL.revokeObjectURL(escolhida.previa);
    setEscolhida({ arquivo, previa: URL.createObjectURL(arquivo) });
  }

  function tirarImagem() {
    if (escolhida) URL.revokeObjectURL(escolhida.previa);
    setEscolhida(null);
    setImagemSalva(null);
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    dados.delete("imagem_arquivo");
    if (escolhida) {
      try {
        dados.set("imagem_arquivo", await imagemMenor(escolhida.arquivo), "banner.jpg");
      } catch {
        return setErroImagem("Não deu para usar essa imagem. Escolha outra, menor.");
      }
    }
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
        <div className="flex flex-col gap-2">
          <span className="text-label">
            Imagem <span className="font-normal text-ink-muted">(opcional)</span>
          </span>
          <span className="text-body-sm text-ink-muted">
            Vai no alto da janela, de ponta a ponta. Melhor deitada (como 16:9), sem texto miúdo: no celular ela fica
            com uns 360 px de largura.
          </span>
          <input type="hidden" name="imagem_atual" value={imagemSalva ?? ""} />
          {!imagemNaPrevia && banner?.imagem && <input type="hidden" name="imagem_tirar" value="1" />}
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-line-strong px-4 text-label hover:bg-surface-300 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
              <ImagePlus aria-hidden className="size-4" />
              {imagemNaPrevia ? "Trocar a imagem" : "Escolher imagem"}
              <input
                type="file"
                name="imagem_arquivo"
                accept="image/png,image/jpeg,image/webp"
                onChange={escolherImagem}
                className="sr-only"
              />
            </label>
            {imagemNaPrevia && (
              <Botao variante="fantasma" onClick={tirarImagem}>
                <Trash2 aria-hidden />
                Tirar a imagem
              </Botao>
            )}
          </div>
          {(erroImagem || erros.imagem) && (
            <p role="alert" className="text-body-sm text-danger">
              {erroImagem ?? erros.imagem}
            </p>
          )}
        </div>
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
          <>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border border-line px-3 py-2.5 has-checked:border-ink">
              <input
                type="checkbox"
                name="busca_da_area"
                checked={daArea}
                onChange={(e) => setDaArea(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
              />
              <span>
                <span className="block text-body">Buscar pela área de quem vê</span>
                <span className="block text-body-sm text-ink-muted">
                  Quem tem currículo vê as vagas do que faz (o “o que você faz” do currículo, ou o último cargo).
                </span>
              </span>
            </label>
            <Campo
              rotulo={daArea ? "Para quem não tem currículo" : "O que buscar"}
              nome="palavra"
              opcional={daArea}
              erro={erros.palavra}
              ajuda={daArea ? "A busca por essa palavra. Vazio: as vagas novas." : "A busca de vagas por essa palavra."}
            >
              <input
                {...ligarCampo("palavra", erros.palavra, true)}
                defaultValue={palavraDoLink(banner?.acao === "busca" ? banner.link : null)}
                maxLength={60}
                placeholder="garçom"
                className={classesEntrada}
              />
            </Campo>
          </>
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
        <fieldset className="flex flex-col gap-2" aria-describedby="paginas-ajuda">
          <legend className="mb-1.5 text-label">Onde abre</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(PAGINAS_BANNER) as PaginaBanner[]).map((p) => (
              <label
                key={p}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm border border-line px-3 has-checked:border-ink"
              >
                <input
                  type="checkbox"
                  name="paginas"
                  value={p}
                  defaultChecked={(banner?.paginas ?? ["inicio"]).includes(p)}
                  className="size-4 accent-[var(--pk-ink)]"
                />
                <span className="text-body">{PAGINAS_BANNER[p]}</span>
              </label>
            ))}
          </div>
          {erros.paginas ? (
            <p className="text-body-sm text-danger">{erros.paginas}</p>
          ) : (
            <p id="paginas-ajuda" className="text-body-sm text-ink-muted">
              Abre na primeira dessas páginas que a pessoa visitar. A inicial com uma busca por palavra não conta.
            </p>
          )}
        </fieldset>
        <Campo
          rotulo="Espera para abrir"
          nome="atraso_segundos"
          erro={erros.atraso_segundos}
          ajuda="Segundos depois que a página abre (0 a 60). Com pouca espera, a janela cobre a página antes de a pessoa ver."
        >
          <span className="flex items-center gap-3">
            <input
              {...ligarCampo("atraso_segundos", erros.atraso_segundos, true)}
              type="number"
              min={0}
              max={60}
              defaultValue={banner?.atraso_segundos ?? 3}
              className={classesEntrada.replace("w-full", "w-24")}
            />
            <span className="text-body">segundos</span>
          </span>
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
          <span className="text-body">Ligado (aparece nas páginas escolhidas)</span>
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
          <div className="flex flex-col gap-4 overflow-hidden rounded-lg border border-line-strong bg-surface-200 p-5 shadow-raised">
            {imagemNaPrevia ? (
              <div className="relative -mx-5 -mt-5">
                {/* eslint-disable-next-line @next/next/no-img-element -- a prévia da imagem escolhida */}
                <img src={imagemNaPrevia} alt="" className="block max-h-48 w-full object-cover" />
                <span className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-pill bg-surface-200/90">
                  <X className="size-4 text-ink" />
                </span>
              </div>
            ) : (
              <div className="flex items-start justify-between">
                <span className="flex size-10 items-center justify-center rounded-pill bg-terra-soft text-terra-text">
                  <Icone className="size-5" />
                </span>
                <X className="size-5 text-ink-muted" />
              </div>
            )}
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
        {/* ligar em verde, desligar em vermelho */}
        <Botao
          tamanho="sm"
          variante={ativo ? "perigo" : "sucesso"}
          disabled={pendente}
          onClick={() => rodar(() => ligarBanner(id, !ativo))}
        >
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
