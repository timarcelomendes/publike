"use client";

import { Download, Image as ImageIcon, MessageCircle, Printer } from "lucide-react";
import { useState } from "react";
import { classesBotao } from "../ui/botao";
import { Selo } from "../ui/basicos";
import { classesEntrada } from "../ui/campo";
import { BotaoCopiar, QuadroParaOSite } from "./pagina-de-vagas";

/**
 * O kit de divulgação em Links para divulgar (claude/plano-pagina-de-vagas.md, parte 2), grátis para todas as contas:
 * o texto pronto para os grupos (curto e completo), as imagens para o Status e o feed (e uma por vaga), o cartaz A4
 * com QR Code e o quadro de vagas para o site da empresa.
 */
export function KitDeDivulgacao({
  perfilId,
  site,
  textoCurto,
  textoCompleto,
  vagas,
  comQuadro,
}: {
  perfilId: string;
  site: string;
  textoCurto: string;
  textoCompleto: string;
  vagas: { id: string; titulo: string }[];
  comQuadro: boolean;
}) {
  const [forma, setForma] = useState<"completo" | "curto">("completo");
  const texto = forma === "completo" ? textoCompleto : textoCurto;
  const imagens = `/perfil/${perfilId}/vagas/imagem`;
  return (
    <section
      id="kit"
      aria-labelledby="kit-titulo"
      className="flex scroll-mt-24 flex-col gap-5 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <div>
        <h3 id="kit-titulo" className="flex items-center gap-2 text-h3">
          <ImageIcon aria-hidden className="size-5 shrink-0 text-ink-muted" />
          Kit para divulgar as vagas
          <Selo variante="novo">Novo</Selo>
        </h3>
        <p className="mt-1 text-body-sm text-ink-muted">
          Tudo pronto para mandar nos grupos, postar no Status e no Instagram, colar na porta e pôr no site. Sempre com
          as vagas abertas de agora.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-label">Texto para os grupos</h4>
          <div role="group" aria-label="Tamanho do texto" className="inline-flex items-center gap-0.5">
            {(
              [
                ["completo", "Com a lista"],
                ["curto", "Curto"],
              ] as const
            ).map(([valor, nome]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={forma === valor}
                onClick={() => setForma(valor)}
                className={`inline-flex min-h-10 items-center rounded-pill px-3 text-label transition-colors ${
                  forma === valor ? "bg-surface-300 text-ink" : "text-ink-muted hover:text-ink"
                }`}
              >
                {nome}
              </button>
            ))}
          </div>
        </div>
        <label htmlFor="kit-texto" className="sr-only">
          Texto pronto
        </label>
        <textarea
          id="kit-texto"
          readOnly
          rows={forma === "completo" ? 8 : 3}
          value={texto}
          onFocus={(e) => e.currentTarget.select()}
          className={`${classesEntrada} resize-y text-body-sm`}
        />
        <div className="flex flex-wrap gap-2">
          <BotaoCopiar texto={texto} rotulo="Copiar texto" />
          <a
            href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={classesBotao("secundario", "sm")}
          >
            <MessageCircle aria-hidden />
            Mandar no WhatsApp
          </a>
        </div>
        <p className="text-body-sm text-ink-muted">Serve também no Facebook, no LinkedIn e no Telegram.</p>
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="text-label">Imagens para postar</h4>
        <div className="grid grid-cols-2 gap-3 sm:max-w-md">
          <Previa
            src={`${imagens}/status`}
            nome="Status e Stories"
            detalhe="1080 × 1920"
            proporcao="aspect-[9/16]"
            baixar={`${imagens}/status?baixar=1`}
          />
          <Previa
            src={`${imagens}/post`}
            nome="Post do feed"
            detalhe="1080 × 1080"
            proporcao="aspect-square"
            baixar={`${imagens}/post?baixar=1`}
          />
        </div>
        {vagas.length > 0 && (
          <details className="group rounded-md border border-line bg-surface-100">
            <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-2 text-label marker:hidden">
              <span className="flex-1">Uma imagem para cada vaga</span>
              <span className="text-body-sm text-ink-muted">{vagas.length}</span>
            </summary>
            <ul className="flex flex-col divide-y divide-line border-t border-line">
              {vagas.map((v) => (
                <li key={v.id} className="flex items-center gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-body-sm">{v.titulo}</span>
                  <a
                    href={`/anuncio/${v.id}/imagem`}
                    target="_blank"
                    rel="noopener"
                    className={classesBotao("fantasma", "sm")}
                  >
                    Ver
                  </a>
                  <a
                    href={`/anuncio/${v.id}/imagem?baixar=1`}
                    download
                    className={classesBotao("secundario", "sm")}
                    aria-label={`Baixar a imagem: ${v.titulo}`}
                  >
                    <Download aria-hidden />
                    Baixar
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h4 className="text-label">Cartaz para imprimir</h4>
        <p className="text-body-sm text-ink-muted">
          Uma folha A4 “Estamos contratando” com as vagas e um QR Code: quem passa aponta a câmera e se candidata. Para
          a porta, o balcão ou o mural do bairro.
        </p>
        <div>
          <a
            href={`/perfil/${perfilId}/vagas/cartaz`}
            target="_blank"
            rel="noopener"
            className={classesBotao("secundario", "sm")}
          >
            <Printer aria-hidden />
            Abrir o cartaz
          </a>
        </div>
      </div>

      {comQuadro && <QuadroParaOSite perfilId={perfilId} site={site} />}
    </section>
  );
}

function Previa({
  src,
  nome,
  detalhe,
  proporcao,
  baixar,
}: {
  src: string;
  nome: string;
  detalhe: string;
  proporcao: string;
  baixar: string;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <a
        href={src}
        target="_blank"
        rel="noopener"
        className={`block overflow-hidden rounded-md border border-line bg-surface-300 ${proporcao}`}
        aria-label={`Ver a imagem: ${nome}`}
      >
        {/* a imagem é gerada na hora (as vagas de agora), sem passar pelo otimizador */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      </a>
      <figcaption className="flex flex-col gap-1.5">
        <span className="text-label">{nome}</span>
        <span className="text-body-sm text-ink-muted">{detalhe}</span>
        <a href={baixar} download className={`${classesBotao("secundario", "sm")} self-start`}>
          <Download aria-hidden />
          Baixar
        </a>
      </figcaption>
    </figure>
  );
}
