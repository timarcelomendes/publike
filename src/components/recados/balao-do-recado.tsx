import { Briefcase, Clock, EyeOff, Wrench } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatarLugar, urlDaFotoRecado, valorCurto } from "@/lib/formato";
import type { Recado } from "@/lib/servidor/recados";
import { Avatar } from "../ui/basicos";
import type { EstadoConexao } from "@/lib/conexoes";
import { BotaoConectarCompacto } from "../conexoes/botao-conectar-compacto";
import { BotaoForca } from "./botao-forca";
import { BotaoIndicar } from "./botao-indicar";
import { MenuDoRecado } from "./menu-do-recado";

/** O que quem escreveu faz, ao lado do nome ("procura trabalho", "está contratando"). */
export function oQueFaz(tipo: string) {
  if (tipo === "pessoa") return "procura trabalho";
  if (tipo === "agencia") return "agência, está contratando";
  return "está contratando";
}

/** A vaga ou o serviço citado: um tíquete pequeno, que leva ao anúncio. */
function Citacao({ r }: { r: Recado }) {
  if (!r.anuncio_id || !r.anuncio_titulo) return null;
  const servico = r.anuncio_tipo === "servico";
  const Icone = servico ? Wrench : Briefcase;
  return (
    <div className="tiquete tiquete-pequeno mt-2.5 grid min-w-0 [--tom:var(--pk-surface-200)] sm:grid-cols-[minmax(0,1fr)_var(--canhoto)]">
      <span aria-hidden className="tiquete-fundo" />
      <span aria-hidden className="tiquete-picote" />
      <div className="flex min-w-0 items-center gap-2.5 px-3 py-2.5">
        <span
          aria-hidden
          className={`grid size-8 shrink-0 place-items-center rounded-pill ${
            servico ? "bg-tom-servico text-cerrado-text" : "bg-tom-vaga text-terra-text"
          }`}
        >
          <Icone className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-display text-[15px] leading-5 font-bold">
            <Link
              href={`/anuncio/${r.anuncio_id}`}
              className="outline-none after:absolute after:inset-0 after:z-[1] after:content-[''] focus-visible:underline"
            >
              {r.anuncio_titulo}
            </Link>
          </p>
          <p className="truncate text-body-sm text-ink-muted">
            {r.anuncio_autor}
            {r.anuncio_cidade && ` · ${formatarLugar(r.anuncio_bairro, r.anuncio_cidade)}`}
            <span className="sm:hidden"> · {valorCurto(r.anuncio_valor, r.anuncio_unidade)}</span>
          </p>
        </div>
      </div>
      <p className="hidden items-center justify-center px-2 font-display text-[15px] leading-5 font-extrabold whitespace-nowrap tabular-nums sm:flex">
        {valorCurto(r.anuncio_valor, r.anuncio_unidade)}
      </p>
    </div>
  );
}

/**
 * O recado: um balão no tom de recado, como numa conversa. O nome e o que a pessoa faz, o texto,
 * a foto, a vaga citada (tíquete pequeno), a Força, o Indicar, o Conectar e o menu. O próprio recado em revisão aparece
 * só para quem escreveu, com "Em revisão". `hora`: no celular, no canto (na linha do tempo).
 * `comFoto`: a foto de quem escreveu no topo (no computador, ela fica no traço da linha).
 */
export function BalaoDoRecado({
  r,
  logado,
  hora = null,
  comFoto = "celular",
  acoes = null,
  conexao,
}: {
  r: Recado;
  logado: boolean;
  hora?: string | null;
  comFoto?: "celular" | "sempre";
  /** o que vem depois da Força (Indicar) */
  acoes?: ReactNode;
  /**
   * a conexão com quem escreveu: com ela (mesmo null, sem conexão), o Conectar fica no rodapé;
   * sem (na página do próprio perfil, que já tem o Conectar), fica no menu
   */
  conexao?: EstadoConexao | null;
}) {
  const foto = urlDaFotoRecado(r.foto);
  const proprio = Boolean(r.meu);
  return (
    <article
      id={`recado-${r.id}`}
      className={`relative min-w-0 rounded-[18px] bg-tom-recado px-3.5 py-3 shadow-[0_1px_1px_rgb(31_26_20/0.07),0_3px_8px_rgb(31_26_20/0.05)] sm:px-4 ${
        comFoto === "celular" ? "sm:rounded-tl-[6px]" : ""
      }`}
    >
      <header className="flex items-start gap-2.5">
        <span className={comFoto === "celular" ? "sm:hidden" : ""}>
          <Avatar
            nome={r.autor_nome}
            foto={r.autor_foto}
            tamanho={32}
            forma={r.autor_tipo === "pessoa" ? "redonda" : "quadrada"}
            colorida
          />
        </span>
        <p className="min-w-0 flex-1 text-body-sm leading-5">
          <Link href={`/perfil/${r.autor_id}`} className="relative z-10 font-bold text-ink hover:underline">
            {r.autor_nome}
          </Link>{" "}
          <span className="text-ink-muted">
            {oQueFaz(r.autor_tipo)}
            {r.bairro && ` · ${formatarLugar(r.bairro, r.cidade)}`}
            {r.distancia_km != null && !proprio && `, ${String(r.distancia_km).replace(".", ",")} km`}
          </span>
        </p>
        {hora && (
          <span
            className={`shrink-0 text-body-sm leading-5 font-semibold text-ink-muted tabular-nums ${
              comFoto === "celular" ? "sm:hidden" : ""
            }`}
          >
            {hora}
          </span>
        )}
      </header>

      {r.status === "revisao" && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-pill bg-surface-100 px-2.5 py-0.5 text-[13px] leading-[18px] font-semibold text-ink-muted">
          <Clock aria-hidden className="size-3.5" />
          Em revisão. Só você vê por enquanto.
        </p>
      )}
      {r.status === "retido" && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-surface-100 px-2.5 py-1.5 text-body-sm text-danger">
          <EyeOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          Não publicado. {r.motivo ?? "A moderação vai analisar."}
        </p>
      )}

      <p className="mt-1.5 text-[16px] leading-6 break-words whitespace-pre-line text-ink">{r.texto}</p>

      {foto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={foto}
          alt=""
          loading="lazy"
          className="mt-2.5 max-h-[280px] w-auto max-w-full rounded-[12px] bg-surface-300 object-cover"
        />
      )}

      <Citacao r={r} />

      <footer className="mt-2.5 flex items-center gap-2">
        {r.status === "no_ar" && (
          <BotaoForca recadoId={r.id} forcas={r.forcas} dei={r.dei_forca} proprio={proprio} logado={logado} />
        )}
        {r.status === "no_ar" && <BotaoIndicar recadoId={r.id} autor={r.autor_nome} />}
        {r.status === "no_ar" && conexao !== undefined && logado && !proprio && (
          <BotaoConectarCompacto
            outro={{ id: r.autor_id, nome: r.autor_nome, tipo: r.autor_tipo }}
            estado={conexao}
            voltar={`/recado/${r.id}`}
          />
        )}
        {r.status === "no_ar" && acoes}
        <span className="ml-auto">
          <MenuDoRecado
            recadoId={r.id}
            proprio={proprio}
            logado={logado}
            autor={conexao === undefined ? { id: r.autor_id, nome: r.autor_nome } : undefined}
          />
        </span>
      </footer>
    </article>
  );
}
