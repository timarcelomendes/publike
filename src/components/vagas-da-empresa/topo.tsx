import { ImagePlus, Megaphone, MessageCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BotaoCompartilhar } from "@/components/anuncio/compartilhar";
import { SeloVerificado } from "@/components/selo-verificado";
import { Avatar } from "@/components/ui/basicos";
import { classesBotao } from "@/components/ui/botao";
import { TIPOS_CONTA } from "@/lib/constantes";
import { formatarLugar, plural } from "@/lib/formato";
import type { Perfil, TipoConta } from "@/lib/tipos";
import { SobreDaEmpresa } from "./sobre";

// O alto da página de vagas da empresa (claude/plano-pagina-de-vagas.md, parte 1): a logo grande, o nome, quantas
// vagas estão abertas, o Sobre e os botões para mandar a página adiante. Para o dono, o que falta (a logo) e o
// caminho do kit de divulgação.

export function TopoDaEmpresa({
  perfil,
  vagas,
  empresas,
  meu,
  whatsapp,
  textoCompartilhar,
  seguir,
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
}) {
  const tipo = TIPOS_CONTA[(perfil.tipo as TipoConta) in TIPOS_CONTA ? (perfil.tipo as TipoConta) : "pessoa"];
  return (
    <header className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-7">
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
              href="/painel/links"
              className="inline-flex min-h-10 items-center gap-1.5 underline underline-offset-2"
            >
              <Megaphone aria-hidden className="size-4 text-terra-text" />
              Divulgar estas vagas: texto pronto, imagens e o quadro para o site
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
