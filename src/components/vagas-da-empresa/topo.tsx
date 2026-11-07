import { Check, ImagePlus, Megaphone, MessageCircle, Palette } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BotaoCompartilhar } from "@/components/anuncio/compartilhar";
import { SeloVerificado } from "@/components/selo-verificado";
import { Avatar } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { TIPOS_CONTA } from "@/lib/constantes";
import { formatarLugar, plural, urlDaFoto } from "@/lib/formato";
import { corLegivel, corValida, textoSobre, type Marca } from "@/lib/marca";
import type { Perfil, TipoConta } from "@/lib/tipos";
import { BannerDaEmpresa } from "./banner";
import { SobreDaEmpresa } from "./sobre";

// O alto da página de vagas da empresa (claude/plano-pagina-de-vagas.md, parte 1): a logo grande, o nome, quantas
// vagas estão abertas, o Sobre e os botões para mandar a página adiante. Para o dono, o que falta (a logo) e o
// caminho do kit de divulgação. Com a página de carreiras liberada (parte 3, `marca`): até 3 fotos no alto (a primeira
// maior; no celular, só ela) ou a faixa na cor da marca e, embaixo, o título da empresa (ou "Por que trabalhar aqui")
// com o texto e os benefícios em destaque.

export function TopoDaEmpresa({
  perfil,
  vagas,
  empresas,
  meu,
  whatsapp,
  textoCompartilhar,
  seguir,
  marca = null,
}: {
  perfil: Perfil;
  /** quantas vagas estão abertas */
  vagas: number;
  /** agência: para quantas empresas são as vagas (as que dizem o nome) */
  empresas: number;
  meu: boolean;
  /** o link do WhatsApp com a lista das vagas pronta */
  whatsapp: string;
  textoCompartilhar: string;
  /** o Seguir (fora para o dono) */
  seguir: ReactNode;
  /** a página de carreiras personalizada (só com a conta liberada) */
  marca?: Marca | null;
}) {
  const tipo = TIPOS_CONTA[(perfil.tipo as TipoConta) in TIPOS_CONTA ? (perfil.tipo as TipoConta) : "pessoa"];
  const cor = corValida(marca?.cor) ? marca.cor : null;
  const fotos = (marca?.fotos.length ? marca.fotos : marca?.capa ? [marca.capa] : [])
    .map((f) => urlDaFoto(f))
    .filter((f): f is string => Boolean(f))
    .slice(0, 3);
  const capa = fotos[0] ?? null;
  // com a chamada (parte 4), o banner fica no lugar das fotos: a frase por cima delas, que passam sozinhas
  const chamada = marca?.chamada?.trim() || null;
  const porQue = marca?.texto?.trim() || marca?.beneficios.length || marca?.titulo?.trim() ? marca : null;
  return (
    <>
      <header
        className="flex flex-col gap-4 overflow-hidden rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-7"
        style={cor && !capa && !chamada ? { borderTop: `6px solid ${cor}` } : undefined}
      >
        {chamada && (
          <div className="-mx-5 -mt-5 sm:-mx-7 sm:-mt-7" style={cor ? { borderBottom: `4px solid ${cor}` } : undefined}>
            <BannerDaEmpresa
              fotos={fotos}
              chamada={chamada}
              subchamada={marca?.subchamada?.trim() || null}
              cor={cor}
              textoSobreCor={cor ? textoSobre(cor) : "#ffffff"}
            />
          </div>
        )}
        {capa && !chamada && (
          <div
            className={`-mx-5 -mt-5 grid gap-1 sm:-mx-7 sm:-mt-7 ${
              fotos.length === 3
                ? "sm:h-72 sm:grid-cols-3 sm:grid-rows-2"
                : fotos.length === 2
                  ? "sm:h-72 sm:grid-cols-3"
                  : ""
            }`}
            style={cor ? { borderBottom: `4px solid ${cor}` } : undefined}
          >
            {/* as fotos são de quem publicou (Storage público), sem o otimizador de imagens */}
            {fotos.map((f, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={f}
                src={f}
                alt=""
                className={
                  i === 0
                    ? `aspect-[3/1] h-full w-full object-cover ${
                        fotos.length === 1 ? "sm:aspect-[4/1]" : "sm:col-span-2 sm:aspect-auto"
                      } ${fotos.length === 3 ? "sm:row-span-2" : ""}`
                    : "hidden h-full min-h-0 w-full object-cover sm:block"
                }
              />
            ))}
          </div>
        )}
        {/* a logo ao lado do nome; no celular menor, e os botões embaixo na largura toda (não espremidos ao lado dela) */}
        <div className="flex items-center gap-4 sm:items-start sm:gap-6">
          <span className="shrink-0 sm:hidden">
            <Avatar nome={perfil.nome} foto={perfil.foto} tamanho={64} forma="quadrada" colorida />
          </span>
          <span className="hidden shrink-0 sm:block">
            <Avatar nome={perfil.nome} foto={perfil.foto} tamanho={88} forma="quadrada" colorida />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-display text-h2 break-words sm:text-h1">
              {perfil.nome}
              {perfil.verificado && (
                <SeloVerificado agencia={perfil.tipo === "agencia"} className="ml-2 inline size-6 align-[-0.15em]" />
              )}
            </h1>
            <p className="text-body text-ink-muted">
              {tipo.nome} · {formatarLugar(perfil.bairro, perfil.cidade)}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-lg font-semibold">
              {vagas ? (
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden className="size-2.5 rounded-pill bg-cerrado" />
                  {plural(vagas, "vaga aberta", "vagas abertas")}
                </span>
              ) : (
                <span className="text-ink-muted">Nenhuma vaga aberta agora</span>
              )}
              {empresas > 1 && (
                <span className="text-body font-normal text-ink-muted">
                  para {plural(empresas, "empresa", "empresas")}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:pl-[112px]">
          {perfil.sobre?.trim() && <SobreDaEmpresa texto={perfil.sobre.trim()} />}
          <div className="flex flex-wrap items-center gap-2">
            {vagas > 0 && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={classesBotao("sucesso", "sm")}>
                <MessageCircle aria-hidden />
                Mandar no WhatsApp
              </a>
            )}
            <BotaoCompartilhar titulo={`Vagas de ${perfil.nome}`} texto={textoCompartilhar} />
            {seguir}
          </div>
          {meu && (
            <div className="flex flex-col gap-2 rounded-md bg-surface-300 px-4 py-3 text-body-sm sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5">
              <span className="font-semibold">Só você vê:</span>
              {!perfil.foto && (
                <Link href="/perfil" className="inline-flex min-h-10 items-center gap-1.5 underline underline-offset-2">
                  <ImagePlus aria-hidden className="size-4 text-terra-text" />
                  Ponha a logo da empresa
                </Link>
              )}
              <Link
                href="/painel/links/pagina"
                className="inline-flex min-h-10 items-center gap-1.5 underline underline-offset-2"
              >
                <Palette aria-hidden className="size-4 text-terra-text" />
                {marca ? "Mudar a cor, as fotos e o texto" : "Personalizar a página"}
              </Link>
              <Link
                href="/painel/links#kit"
                className="inline-flex min-h-10 items-center gap-1.5 underline underline-offset-2"
              >
                <Megaphone aria-hidden className="size-4 text-terra-text" />
                Divulgar estas vagas: texto pronto, imagens e o quadro para o site
              </Link>
            </div>
          )}
        </div>
      </header>
      {porQue && (
        <section
          aria-labelledby="por-que-trabalhar"
          className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-7"
        >
          <h2 id="por-que-trabalhar" className="font-display text-h3" style={{ color: corLegivel(cor) }}>
            {porQue.titulo?.trim() || "Por que trabalhar aqui"}
          </h2>
          {porQue.texto?.trim() && <p className="max-w-[70ch] text-body whitespace-pre-line">{porQue.texto.trim()}</p>}
          {porQue.beneficios.length > 0 && (
            <ul aria-label="Benefícios" className="flex flex-wrap gap-2">
              {porQue.beneficios.map((b) => (
                <li
                  key={b}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border bg-surface-100 px-3 text-label"
                  style={{ borderColor: cor ?? "var(--pk-line)" }}
                >
                  <Check aria-hidden className="size-4" style={{ color: corLegivel(cor) }} />
                  {b}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
