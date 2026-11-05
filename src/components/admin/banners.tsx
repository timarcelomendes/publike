"use client";

import {
  ArrowRight,
  ExternalLink,
  Eye,
  ImagePlus,
  Power,
  Search,
  Share2,
  Sparkles,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { startTransition, useActionState, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { protegerAcao } from "@/lib/acao-segura";
import { apagarBanner, ligarBanner, salvarBanner } from "@/lib/acoes/admin-banners";
import {
  ACOES_BANNER,
  DESTAQUES_NO_ALTO,
  FORMATOS_BANNER,
  PAGINAS_BANNER,
  palavraDoLink,
  PUBLICOS_BANNER,
  SEGUNDOS_DO_DESTAQUE,
  SEM_FILTRO,
  temFiltro,
  type AcaoBanner,
  type FiltroBanner,
  type FormatoBanner,
  type PaginaBanner,
  type PublicoBanner,
} from "@/lib/banners";
import { CATEGORIAS, CIDADES, LISTA_TIPOS_CONTA, TIPOS_CONTA } from "@/lib/constantes";
import type { EstadoForm } from "@/lib/tipos";
import { Aviso, Simbolo } from "../ui/basicos";
import { Botao, classesBotao } from "../ui/botao";
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
  /** para quem, além do público (migração 20261214) */
  filtro: FiltroBanner;
  /** as contas escolhidas: o e-mail (ou o código) de cada uma, uma por linha */
  contas: string;
  /** onde aparece, um ou mais: a janela, o cartão "Do Publike", o destaque e o topo da linha do tempo (migração 20270217) */
  formatos: FormatoBanner[];
  /** também em /novidades */
  em_novidades: boolean;
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

/** O que cada formato faz, embaixo do nome dele. */
const AJUDA_DO_FORMATO: Record<FormatoBanner, string> = {
  janela: "Abre por cima, nas páginas e depois da espera que você escolher.",
  cartao:
    "Como um patrocinado: na lista da página inicial (sem conta) e na linha do tempo (com conta), depois dos 3 primeiros. Conta como visto quando fica metade na tela por 1 segundo e some depois.",
  destaque:
    "Na faixa do alto da página inicial de quem ainda não tem conta, só no computador, girando com as 3 vagas novas. Fica no ar dentro das datas.",
  topo: "Primeiro item da linha do tempo de quem tem conta, antes de tudo. Conta como visto quando fica metade na tela por 1 segundo; o X fecha.",
};

/** O nome curto de cada formato, nas abas da prévia. */
const ABA_DO_FORMATO: Record<FormatoBanner, string> = {
  janela: "Janela",
  cartao: "Meio da lista",
  destaque: "Destaque",
  topo: "Topo da linha",
};

/** Criar (sem `banner`) ou editar um banner, com a prévia de como fica a janela (ou o cartão). */
export function FormBanner({ banner }: { banner?: BannerParaEditar }) {
  // sem id (vazio): um banner novo já preenchido (o "Fazer banner" de Admin › Novidades)
  const id = banner?.id || null;
  const salvarProtegido = useMemo(() => protegerAcao(salvarBanner.bind(null, id)), [id]);
  const [estado, acao, enviando] = useActionState(salvarProtegido, {
    ok: false,
  } as EstadoForm);
  const erros = estado.erros ?? {};
  const [tipo, setTipo] = useState<AcaoBanner>(banner?.acao ?? "novas");
  const [titulo, setTitulo] = useState(banner?.titulo ?? "");
  const [texto, setTexto] = useState(banner?.texto ?? "");
  const [botao, setBotao] = useState(banner?.botao ?? BOTAO_SUGERIDO.novas);
  const [caminho, setCaminho] = useState(banner?.acao === "link" ? (banner.link ?? "") : "");
  // "Testar o link" só abre página do Publike (começa com uma barra só), como o banco aceita
  const caminhoValido = /^\/(?!\/)\S*$/.test(caminho.trim());
  // o texto do botão acompanha a ação enquanto ninguém mexeu nele
  const [botaoMexido, setBotaoMexido] = useState(Boolean(banner));
  const [repetir, setRepetir] = useState(banner?.repetir_dias != null);
  const [daArea, setDaArea] = useState(banner?.busca_da_area ?? false);
  const [formatos, setFormatos] = useState<FormatoBanner[]>(banner?.formatos?.length ? banner.formatos : ["janela"]);
  // escolher o destaque põe "Quem vê" em "Todo mundo" (dá para mudar depois)
  const [publico, setPublico] = useState<PublicoBanner>(banner?.publico ?? "todos");
  // o destaque: na faixa do alto da inicial de quem não tem conta (computador), girando com as 3 vagas novas
  const destaque = formatos.includes("destaque");
  // só o destaque: sem o "Só para" e sem o "quantas vezes" (é vitrine)
  const soDestaque = formatos.length === 1 && destaque;
  const semJanela = !formatos.includes("janela");
  // a prévia: a aba escolhida, se ainda está marcada; senão, o primeiro formato
  const [abaDaPrevia, setAbaDaPrevia] = useState<FormatoBanner>(formatos[0] ?? "janela");
  const previa = formatos.includes(abaDaPrevia) ? abaDaPrevia : (formatos[0] ?? "janela");
  const ordem = Object.keys(FORMATOS_BANNER) as FormatoBanner[];
  function marcarFormato(f: FormatoBanner, ligado: boolean) {
    setFormatos((antes) => ordem.filter((x) => (x === f ? ligado : antes.includes(x))));
    if (ligado) setAbaDaPrevia(f);
    // escolher o destaque põe "Quem vê" em "Todo mundo" (dá para mudar depois)
    if (ligado && f === "destaque" && formatos.length === 0) setPublico("todos");
  }
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
        <fieldset className="flex flex-col gap-2" aria-describedby="formatos-ajuda">
          <legend className="mb-1.5 text-label">Formato</legend>
          <p id="formatos-ajuda" className="-mt-1 text-body-sm text-ink-muted">
            Marque um ou mais. Quem viu o banner em um formato não vê de novo em outro (conforme as vezes que ele
            aparece, mais abaixo).
          </p>
          <input type="hidden" name="formatos_antes" value={(banner?.formatos ?? ["janela"]).join(",")} />
          {ordem.map((f) => (
            <label
              key={f}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border border-line px-3 py-2.5 has-checked:border-ink"
            >
              <input
                type="checkbox"
                name="formatos"
                value={f}
                checked={formatos.includes(f)}
                onChange={(e) => marcarFormato(f, e.target.checked)}
                aria-invalid={erros.formatos ? true : undefined}
                className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
              />
              <span>
                <span className="block text-body">{FORMATOS_BANNER[f]}</span>
                <span className="block text-body-sm text-ink-muted">{AJUDA_DO_FORMATO[f]}</span>
              </span>
            </label>
          ))}
          {erros.formatos && <p className="text-body-sm text-danger">{erros.formatos}</p>}
        </fieldset>
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
            {formatos.includes("janela") && "Na janela, vai no alto, de ponta a ponta. "}
            {(formatos.includes("cartao") || formatos.includes("topo")) &&
              "No cartão, vai em cima no celular e à esquerda no computador. "}
            {destaque && "No destaque, vai no alto do cartão, de ponta a ponta, com 144 px de altura (cortada no meio). "}
            Melhor deitada (como 16:9), sem texto miúdo: no celular ela fica com uns 360 px de largura.
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
            <span className="flex flex-col gap-2 sm:flex-row">
              <input
                {...ligarCampo("caminho", erros.caminho, true)}
                value={caminho}
                onChange={(e) => setCaminho(e.target.value)}
                maxLength={300}
                placeholder="/vagas/goiania"
                className={`${classesEntrada} sm:flex-1`}
              />
              {caminhoValido ? (
                <a
                  href={caminho.trim()}
                  target="_blank"
                  rel="noopener"
                  className={classesBotao("secundario", "md", "shrink-0")}
                >
                  <ExternalLink aria-hidden />
                  Testar o link
                </a>
              ) : (
                <Botao variante="secundario" disabled className="shrink-0">
                  <ExternalLink aria-hidden />
                  Testar o link
                </Botao>
              )}
            </span>
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
        <Campo
          rotulo="Quem vê"
          nome="publico"
          erro={erros.publico}
          ajuda={
            destaque
              ? "No destaque, só quem ainda não tem conta: “Todo mundo” e “Quem ainda não tem conta” dão no mesmo; os outros dois seguem a resposta de “O que você quer fazer”."
              : formatos.includes("topo") && formatos.length === 1
                ? "O topo da linha do tempo é só para quem tem conta: “Quem ainda não tem conta” não vê."
                : undefined
          }
        >
          <Seletor
            {...ligarCampo("publico", erros.publico, Boolean(destaque || formatos.includes("topo")))}
            value={publico}
            onChange={(e) => setPublico(e.target.value as PublicoBanner)}
            className={classesEntrada}
          >
            {(Object.keys(PUBLICOS_BANNER) as PublicoBanner[]).map((p) => (
              <option key={p} value={p}>
                {PUBLICOS_BANNER[p]}
              </option>
            ))}
          </Seletor>
        </Campo>
        {/* só o destaque (só para quem não tem conta): sem o "Só para" (escondido, para voltar a outro formato sem perder) */}
        <div className={soDestaque ? "hidden" : "contents"}>
          <ParaQuem filtro={banner?.filtro ?? SEM_FILTRO} contas={banner?.contas ?? ""} erros={erros} />
        </div>
        <fieldset className={semJanela ? "hidden" : "flex flex-col gap-2"} aria-describedby="paginas-ajuda">
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
        <div className={semJanela ? "hidden" : "contents"}>
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
        </div>
        {destaque && (
          <p className="rounded-md bg-surface-300 px-3 py-2.5 text-body-sm">
            O destaque é vitrine: fica no ar dentro das datas, para todo visitante, sem “Só para” e sem “só uma vez”
            {soDestaque ? "" : " (esses valem só para os outros formatos marcados)"}.
            Começa pelas 3 vagas novas e troca a cada {SEGUNDOS_DO_DESTAQUE} segundos; cada visitante vê até{" "}
            {DESTAQUES_NO_ALTO} destaques, os mais novos.
          </p>
        )}
        <fieldset className={soDestaque ? "hidden" : "flex flex-col gap-2"}>
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
        <input type="hidden" name="novidades_antes" value={banner?.em_novidades ? "1" : ""} />
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-sm border border-line px-3 py-2.5 has-checked:border-ink">
          <input
            type="checkbox"
            name="em_novidades"
            defaultChecked={banner?.em_novidades ?? false}
            className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
          />
          <span>
            <span className="block text-body">Também em Novidades</span>
            <span className="block text-body-sm text-ink-muted">
              Fica na página /novidades (“Novidades do Publike”), mesmo depois que sair do ar. Desligado, sai de lá
              também.
            </span>
          </span>
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="ativo"
            defaultChecked={banner?.ativo ?? true}
            className="size-5 accent-[var(--pk-ink)]"
          />
          <span className="text-body">
            Ligado (aparece nos formatos marcados)
          </span>
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
        {formatos.length > 1 && (
          // uma aba por formato marcado
          <div role="group" aria-label="Ver a prévia de" className="flex flex-wrap gap-1.5">
            {formatos.map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={previa === f}
                onClick={() => setAbaDaPrevia(f)}
                className={`min-h-9 rounded-pill border px-3 text-body-sm transition-colors ${
                  previa === f
                    ? "border-ink bg-ink text-surface-100"
                    : "border-line bg-surface-200 text-ink hover:bg-surface-300"
                }`}
              >
                {ABA_DO_FORMATO[f]}
              </button>
            ))}
          </div>
        )}
        {(previa === "cartao" || previa === "topo") && (
          <div aria-hidden className="rounded-lg bg-surface-100 p-4">
            <div className="relative flex flex-col overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
              {imagemNaPrevia && (
                // eslint-disable-next-line @next/next/no-img-element -- a prévia da imagem escolhida
                <img src={imagemNaPrevia} alt="" className="block max-h-40 w-full object-cover" />
              )}
              <span className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-pill bg-surface-200/90">
                <X className="size-4 text-ink-muted" />
              </span>
              <div className="flex flex-col gap-3 p-4">
                <span className="inline-flex items-center gap-1.5 text-label">
                  <Simbolo altura={18} />
                  Do Publike
                </span>
                <div>
                  <p className="font-display text-[17px] leading-[22px] font-bold text-balance">
                    {titulo || "Título do banner"}
                  </p>
                  {texto && <p className="mt-1 text-body-sm whitespace-pre-line text-ink-muted">{texto}</p>}
                </div>
                <span className="inline-flex min-h-10 items-center gap-2 self-start rounded-md bg-terra px-3.5 text-label text-on-terra">
                  {botao || "Botão"}
                  <ArrowRight className="size-4" />
                </span>
              </div>
            </div>
            <p className="mt-3 text-body-sm text-ink-muted">
              {previa === "topo"
                ? "No alto da linha do tempo de quem tem conta, antes do primeiro item. "
                : "Na lista da inicial e na linha do tempo, depois dos 3 primeiros. "}
              No computador, a imagem fica à esquerda e o cartão vai de ponta a ponta da lista.
            </p>
          </div>
        )}
        {previa === "destaque" && (
          <div aria-hidden className="rounded-lg bg-surface-300 p-4">
            <div className="flex flex-col overflow-hidden rounded-[18px] border border-line bg-surface-200 shadow-raised">
              {imagemNaPrevia && (
                // eslint-disable-next-line @next/next/no-img-element -- a prévia da imagem escolhida
                <img src={imagemNaPrevia} alt="" className="block h-36 w-full object-cover" />
              )}
              <div className="flex flex-col gap-3 p-4">
                <span className="inline-flex items-center gap-1.5 text-label">
                  <Simbolo altura={18} />
                  Do Publike
                </span>
                <div>
                  <p className="font-display text-[20px] leading-[26px] font-bold text-balance">
                    {titulo || "Título do banner"}
                  </p>
                  {texto && <p className="mt-1 line-clamp-3 text-body-sm text-ink-muted">{texto}</p>}
                </div>
                <span className="inline-flex min-h-10 items-center gap-2 self-start rounded-md bg-terra px-3.5 text-label text-on-terra">
                  {botao || "Botão"}
                  <ArrowRight className="size-4" />
                </span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5">
              <span className="h-2 w-2 rounded-pill bg-line-strong" />
              <span className="h-2 w-6 rounded-pill bg-ink" />
              <span className="h-2 w-2 rounded-pill bg-line-strong" />
            </div>
            <p className="mt-3 text-body-sm text-ink-muted">
              Na faixa do alto da inicial, no computador, no lugar das 3 vagas novas enquanto é a vez dele.
            </p>
          </div>
        )}
        <div aria-hidden className={previa !== "janela" ? "hidden" : "rounded-lg bg-veu p-4"}>
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

const caixinha =
  "inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-pill border border-line px-3 text-body-sm has-checked:border-ink has-checked:bg-surface-300";

/**
 * "Só para": além do público, o banner pode ir só para tipos de conta, áreas, quem tem (ou não) currículo,
 * cidades, contas novas e contas escolhidas uma a uma. Com qualquer um, só quem entrou na conta vê.
 */
function ParaQuem({ filtro, contas, erros }: { filtro: FiltroBanner; contas: string; erros: Record<string, string> }) {
  const tinha = temFiltro(filtro);
  return (
    <details open={tinha} className="group rounded-md border border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-label">
        <span>
          Só para… <span className="font-normal text-ink-muted">(opcional)</span>
        </span>
        <span className="text-body-sm font-normal text-ink-muted group-open:hidden">
          tipo de conta, área, currículo, cidade, contas novas ou escolhidas
        </span>
      </summary>
      {tinha && <input type="hidden" name="filtros_antes" value="1" />}
      <div className="flex flex-col gap-5 border-t border-line p-3">
        <p className="text-body-sm text-ink-muted">
          Vale junto com “Quem vê”. Com qualquer um destes, o banner aparece só para quem entrou na conta e combina com
          todos os marcados. Nada marcado: todo mundo de “Quem vê”.
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label">Tipo de conta</legend>
          <div className="flex flex-wrap gap-2">
            {LISTA_TIPOS_CONTA.map((t) => (
              <label key={t} className={caixinha}>
                <input
                  type="checkbox"
                  name="tipos_conta"
                  value={t}
                  defaultChecked={filtro.tipos_conta.includes(t)}
                  className="size-4 accent-[var(--pk-ink)]"
                />
                {TIPOS_CONTA[t].nome}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label">Área</legend>
          <p className="-mt-1 text-body-sm text-ink-muted">
            Quem procura: a área do currículo. Quem contrata: as áreas das vagas dele.
          </p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIAS.filter((x) => x.slug !== "outros").map((x) => (
              <label key={x.slug} className={caixinha}>
                <input
                  type="checkbox"
                  name="categorias"
                  value={x.slug}
                  defaultChecked={filtro.categorias.includes(x.slug)}
                  className="size-4 accent-[var(--pk-ink)]"
                />
                {x.nome}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label">Currículo</legend>
          <div className="flex flex-wrap gap-2">
            {[
              ["", "Tanto faz"],
              ["sem", "Só quem ainda não tem"],
              ["com", "Só quem já tem"],
            ].map(([valor, nome]) => (
              <label key={valor} className={caixinha}>
                <input
                  type="radio"
                  name="curriculo"
                  value={valor}
                  defaultChecked={(filtro.curriculo ?? "") === valor}
                  className="size-4 accent-[var(--pk-ink)]"
                />
                {nome}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label">Cidade da conta</legend>
          <div className="flex flex-wrap gap-2">
            {CIDADES.map((cidade) => (
              <label key={cidade} className={caixinha}>
                <input
                  type="checkbox"
                  name="cidades"
                  value={cidade}
                  defaultChecked={filtro.cidades.includes(cidade)}
                  className="size-4 accent-[var(--pk-ink)]"
                />
                {cidade}
              </label>
            ))}
          </div>
        </fieldset>
        <Campo
          rotulo="Só contas novas"
          nome="conta_ate_dias"
          opcional
          erro={erros.conta_ate_dias}
          ajuda="Criadas há até quantos dias (de 1 a 365). Vazio: qualquer conta."
        >
          <input
            {...ligarCampo("conta_ate_dias", erros.conta_ate_dias, true)}
            type="number"
            inputMode="numeric"
            min={1}
            max={365}
            defaultValue={filtro.conta_ate_dias ?? ""}
            className={`${classesEntrada} w-32`}
          />
        </Campo>
        <Campo
          rotulo="Contas escolhidas"
          nome="contas"
          opcional
          erro={erros.contas}
          ajuda="O e-mail de cada conta (ou o código, do endereço em Admin › Usuários), um por linha. Só elas veem. Ninguém de fora vê a lista."
        >
          <textarea
            {...ligarCampo("contas", erros.contas, true)}
            defaultValue={contas}
            rows={3}
            placeholder={"maria@email.com\njoao@email.com"}
            className={`${classesEntrada} font-mono text-body-sm`}
          />
        </Campo>
      </div>
    </details>
  );
}
