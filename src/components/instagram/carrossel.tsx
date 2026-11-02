"use client";

import { ArrowDown, ArrowUp, Download, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BotaoCopiar } from "../painel/pagina-de-vagas";
import { classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { REGIMES } from "@/lib/constantes";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import type { Regime } from "@/lib/tipos";
import { legendaDoDia, MAX_VAGAS_DO_DIA, tituloDaEmpresa, valorDaVagaDoDia, type VagaDoDia } from "@/lib/vagas-do-dia";

/**
 * O carrossel e os stories do Instagram, montados com as vagas no ar: escolher e ordenar (a ordem é a do carrossel
 * e da legenda), ver as imagens que o site desenha, copiar a legenda e os links e baixar tudo num .zip. Em Admin ›
 * Vagas do dia (assinatura do Publike) e no kit de divulgação (a da empresa). A escolha fica no endereço (?v=):
 * recarregar a página não perde nada.
 */
export function CarrosselDoInstagram({
  candidatas,
  iniciais,
  dia,
  agora,
  rotas,
  links,
  nomeDaConta,
  ajudaDaBio,
}: {
  candidatas: VagaDoDia[];
  iniciais: string[];
  dia: string;
  agora: number;
  /** de onde vêm as imagens ("/admin/vagas-do-dia/imagem") e o .zip */
  rotas: { imagens: string; baixar: string };
  /** o link da bio e o de cada story (o começo e o fim, em volta do código da vaga) */
  links: { bio: string; story: [string, string] };
  /** no kit: o nome da conta (a legenda diz "X está contratando", e o nome não se repete em cada vaga); sem ele, a
   * legenda é a do Publike ("Vagas do dia em Goiânia e região") */
  nomeDaConta?: string;
  ajudaDaBio?: ReactNode;
}) {
  const IMAGENS = rotas.imagens;
  const linkDoStory = (id: string) => `${links.story[0]}${id}${links.story[1]}`;
  const [ordem, setOrdem] = useState<string[]>(iniciais);
  // as imagens seguem a escolha com um respiro: cada clique não pede todas de novo ao servidor
  const [estavel, setEstavel] = useState<string[]>(iniciais);
  useEffect(() => {
    const t = window.setTimeout(() => setEstavel(ordem), 700);
    const url = new URL(window.location.href);
    if (ordem.length) url.searchParams.set("v", ordem.join(","));
    else url.searchParams.delete("v");
    // as vírgulas ficam legíveis no endereço (o servidor lê igual)
    window.history.replaceState(window.history.state, "", url.toString().replace(/%2C/gi, ","));
    return () => window.clearTimeout(t);
  }, [ordem]);

  const porId = useMemo(() => new Map(candidatas.map((v) => [v.id, v])), [candidatas]);
  const escolhidas = ordem.flatMap((id) => porId.get(id) ?? []);
  const outras = candidatas.filter((v) => !ordem.includes(v.id));
  const cheio = ordem.length >= MAX_VAGAS_DO_DIA;
  const nasImagens = estavel.flatMap((id) => porId.get(id) ?? []);
  const total = nasImagens.length;
  const legenda = legendaDoDia(
    escolhidas,
    dia,
    nomeDaConta ? tituloDaEmpresa(nomeDaConta, escolhidas.length) : undefined,
  );
  const bio = links.bio;

  const tirar = (id: string) => setOrdem((o) => o.filter((x) => x !== id));
  const por = (id: string) =>
    setOrdem((o) => (o.length >= MAX_VAGAS_DO_DIA || o.includes(id) ? o : [...o, id]));
  const mover = (id: string, passo: -1 | 1) =>
    setOrdem((o) => {
      const i = o.indexOf(id);
      const j = i + passo;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const nova = [...o];
      [nova[i], nova[j]] = [nova[j], nova[i]];
      return nova;
    });

  const detalhe = (v: VagaDoDia) =>
    [
      v.regime ? REGIMES[v.regime as Regime]?.selo : null,
      valorDaVagaDoDia(v),
      formatarLugar(v.bairro, v.cidade),
      nomeDaConta ? (v.quem && v.quem !== nomeDaConta ? (v.quem === "Empresa confidencial" ? v.quem : `Para ${v.quem}`) : null) : (v.quem ?? "Pessoa física"),
      tempoRelativo(v.criado_em, agora),
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h3 className="flex items-baseline justify-between gap-2 text-label">
            No carrossel, nesta ordem
            <span className="text-body-sm font-normal text-ink-muted tabular-nums">
              {ordem.length} de {MAX_VAGAS_DO_DIA}
            </span>
          </h3>
          {escolhidas.length === 0 ? (
            <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center text-body-sm text-ink-muted">
              Toque em “Pôr” nas vagas abaixo para montar o carrossel.
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-100">
              {escolhidas.map((v, i) => (
                <li key={v.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-6 shrink-0 text-center text-label text-ink-muted tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label">{v.titulo}</p>
                    <p className="truncate text-body-sm text-ink-muted">{detalhe(v)}</p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => mover(v.id, -1)}
                      disabled={i === 0}
                      className={classesBotao("fantasma", "sm", "px-2")}
                      aria-label={`Subir: ${v.titulo}`}
                    >
                      <ArrowUp aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(v.id, 1)}
                      disabled={i === escolhidas.length - 1}
                      className={classesBotao("fantasma", "sm", "px-2")}
                      aria-label={`Descer: ${v.titulo}`}
                    >
                      <ArrowDown aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => tirar(v.id)}
                      className={classesBotao("fantasma", "sm", "px-2")}
                      aria-label={`Tirar do carrossel: ${v.titulo}`}
                    >
                      <X aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <p className="text-body-sm text-ink-muted">
            As 4 primeiras aparecem na capa. Comece pelas que dizem quanto pagam.
          </p>
        </div>

        {outras.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="flex items-baseline justify-between gap-2 text-label">
              Outras vagas do período
              <span className="text-body-sm font-normal text-ink-muted tabular-nums">{outras.length}</span>
            </h3>
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-100">
              {outras.map((v) => (
                <li key={v.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label">{v.titulo}</p>
                    <p className="truncate text-body-sm text-ink-muted">{detalhe(v)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => por(v.id)}
                    disabled={cheio}
                    className={classesBotao("secundario", "sm", "shrink-0")}
                    aria-label={`Pôr no carrossel: ${v.titulo}`}
                    title={cheio ? `O carrossel tem no máximo ${MAX_VAGAS_DO_DIA} vagas` : undefined}
                  >
                    <Plus aria-hidden />
                    Pôr
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {escolhidas.length > 0 && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2">
            <a
              href={`${rotas.baixar}?ids=${ordem.join(",")}`}
              download
              className={classesBotao("primario", "md")}
            >
              <Download aria-hidden />
              Baixar tudo (.zip)
            </a>
            <BotaoCopiar texto={legenda} rotulo="Copiar a legenda" />
          </div>
          <p className="-mt-3 text-body-sm text-ink-muted">
            O .zip traz o carrossel na ordem de postar, um story por vaga, a legenda e os links dos stories.
          </p>

          <section aria-labelledby="dia-carrossel" className="flex flex-col gap-3">
            <h3 id="dia-carrossel" className="text-label">
              Carrossel do feed{" "}
              <span className="font-normal text-ink-muted">
                · {total + 2} imagens de 1080 × 1350
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              <Previa
                src={`${IMAGENS}/capa?ids=${estavel.join(",")}`}
                nome="1 · Capa"
                proporcao="aspect-[4/5]"
              />
              {nasImagens.map((v, i) => (
                <Previa
                  key={`${v.id}-${i}-${total}`}
                  src={`${IMAGENS}/vaga?id=${v.id}&n=${i + 1}&total=${total}`}
                  nome={`${i + 2} · ${v.titulo}`}
                  proporcao="aspect-[4/5]"
                />
              ))}
              <Previa
                src={`${IMAGENS}/fim?total=${total}`}
                nome={`${total + 2} · Como se candidatar`}
                proporcao="aspect-[4/5]"
              />
            </div>
          </section>

          <section aria-labelledby="dia-legenda" className="flex flex-col gap-2">
            <h3 id="dia-legenda" className="text-label">
              Legenda
            </h3>
            <label htmlFor="dia-legenda-texto" className="sr-only">
              Legenda pronta
            </label>
            <textarea
              id="dia-legenda-texto"
              readOnly
              rows={10}
              value={legenda}
              onFocus={(e) => e.currentTarget.select()}
              className={`${classesEntrada} resize-y text-body-sm`}
            />
            <p className="text-body-sm text-ink-muted">
              {legenda.length} de 2.200 letras. Os números da lista são os das imagens.
            </p>
          </section>

          <section aria-labelledby="dia-stories" className="flex flex-col gap-3">
            <h3 id="dia-stories" className="text-label">
              Stories{" "}
              <span className="font-normal text-ink-muted">· um por vaga, 1080 × 1920</span>
            </h3>
            <p className="text-body-sm text-ink-muted">
              Em cada story, ponha o adesivo Link em cima da seta, com o link da vaga: ele abre a página onde a pessoa
              curte.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {nasImagens.map((v) => (
                <Previa
                  key={v.id}
                  src={`${IMAGENS}/story?id=${v.id}`}
                  nome={v.titulo}
                  proporcao="aspect-[9/16]"
                  link={linkDoStory(v.id)}
                />
              ))}
            </div>
          </section>

          <section aria-labelledby="dia-bio" className="flex flex-col gap-2">
            <h3 id="dia-bio" className="text-label">
              Link da bio
            </h3>
            <label htmlFor="dia-bio-link" className="sr-only">
              Link da bio
            </label>
            <input
              id="dia-bio-link"
              readOnly
              value={bio}
              onFocus={(e) => e.currentTarget.select()}
              className={`${classesEntrada} text-body-sm`}
            />
            <div>
              <BotaoCopiar texto={bio} rotulo="Copiar o link" />
            </div>
            {ajudaDaBio && <p className="text-body-sm text-ink-muted">{ajudaDaBio}</p>}
          </section>

          <details className="rounded-md border border-line bg-surface-100">
            <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 py-2 text-label marker:hidden">
              Como postar
            </summary>
            <ul className="flex list-disc flex-col gap-1.5 border-t border-line px-4 py-3 pl-8 text-body-sm text-ink-muted">
              <li>
                Carrossel: no Instagram, + › Post, marque as imagens na ordem dos números (01, 02…) e cole a legenda.
              </li>
              <li>Stories: um por vaga, cada um com o adesivo Link da vaga dele.</li>
              <li>Do computador, o Meta Business Suite publica e agenda o carrossel.</li>
              <li>Comente e responda quem perguntar: comentário faz o post chegar a mais gente.</li>
              <li>Mesmo horário todo dia ajuda quem segue a criar o hábito de olhar.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}

function Previa({
  src,
  nome,
  proporcao,
  link,
}: {
  src: string;
  nome: string;
  proporcao: string;
  /** no story, o link do adesivo */
  link?: string;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <a
        href={src}
        target="_blank"
        rel="noopener"
        className={`block overflow-hidden rounded-md border border-line bg-surface-300 ${proporcao}`}
        aria-label={`Ver a imagem: ${nome}`}
      >
        {/* desenhada na hora pelo servidor (as vagas de agora), sem passar pelo otimizador */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      </a>
      <figcaption className="flex min-w-0 flex-col gap-1.5">
        <span className="truncate text-body-sm">{nome}</span>
        <div className="flex flex-wrap gap-1.5">
          <a href={`${src}&baixar=1`} download className={classesBotao("secundario", "sm")}>
            <Download aria-hidden />
            Baixar
          </a>
          {link && <BotaoCopiar texto={link} rotulo="Link" />}
        </div>
      </figcaption>
    </figure>
  );
}
