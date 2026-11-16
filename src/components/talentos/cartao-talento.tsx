import { Briefcase, Car, Clock, GraduationCap, History, MapPin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import { textoDaExperiencia, tituloDoTalento, type TalentoResumo } from "@/lib/talentos";
import { Avatar } from "../ui/basicos";

/** Quantas habilidades aparecem no cartão (o resto vira "+3"). */
const NO_CARTAO = 3;

/** Cada habilidade: uma pílula clara, em letra normal (não é um selo). */
const pilula = "inline-flex items-center rounded-pill px-2.5 py-0.5 text-body-sm";
export const classesHabilidade = `${pilula} bg-surface-300 text-ink`;
const classesMais = `${pilula} border border-line-strong text-ink-muted`;

/** "Pode de manhã, à tarde e no fim de semana". */
export function textoDisponibilidade(lista: string[]) {
  const nomes = lista.map((d) => nomeDisponibilidade(d).toLowerCase());
  if (!nomes.length) return null;
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

/**
 * Uma pessoa na aba Talentos: o que faz, onde mora (bairro e, com o lugar de quem vê, a distância aproximada), a
 * experiência (os cargos, sem as empresas) e as habilidades. Sem foto e com o nome encurtado; o cartão todo abre a
 * página dela. `acao` (Conectar e Marcar para convidar) fica por cima do link do cartão. `previa`: o cartão que a
 * pessoa vê na tela do currículo enquanto preenche (sem o link e sem o título na lista de títulos da página).
 */
export function CartaoTalento({
  t,
  acao,
  previa = false,
  procurando = false,
  distancia = null,
  agora = null,
}: {
  t: TalentoResumo;
  acao?: ReactNode;
  previa?: boolean;
  /** postou "Procuro trabalho" nos últimos 14 dias (o selo "Procurando agora") */
  procurando?: boolean;
  /** "≈ 3 km de você" (do centro do bairro dela até o lugar de quem vê) */
  distancia?: string | null;
  /** a hora da página: com ela, "atualizou há 3 dias" */
  agora?: number | null;
}) {
  const estudo = nomeEscolaridade(t.escolaridade);
  const turnos = textoDisponibilidade(t.disponibilidade);
  const habilidades = t.habilidades.length ? t.habilidades : t.cursos;
  const experiencia = textoDaExperiencia(t.meses_experiencia, t.cargos.length > 0);
  return (
    <article
      className={`relative flex h-full flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5 ${
        previa
          ? ""
          : "transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus"
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar nome={t.nome} tamanho={48} colorida />
        <div className="min-w-0 flex-1">
          {previa ? (
            <p className="text-h3 break-words">{tituloDoTalento(t)}</p>
          ) : (
            <h2 className="text-h3 break-words">
              <Link
                href={`/talentos/${t.perfil_id}`}
                className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
              >
                {tituloDoTalento(t)}
              </Link>
            </h2>
          )}
          <p className="text-body-sm text-ink">{t.nome}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-body-sm">
        <span className="inline-flex min-w-0 items-start gap-1">
          <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-terra-text" />
          <span>
            {formatarLugar(t.bairro, t.cidade)}
            {distancia && <span className="text-ink-muted"> · {distancia}</span>}
          </span>
        </span>
        {procurando && (
          <span className="inline-flex items-center gap-1.5 rounded-pill bg-cerrado/15 px-2.5 py-0.5 text-[13px] leading-[18px] font-semibold text-cerrado-text">
            <span aria-hidden className="size-2 rounded-pill bg-cerrado" />
            Procurando agora
          </span>
        )}
      </div>

      <p className="flex items-start gap-2 text-body-sm">
        <Briefcase aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        <span className="line-clamp-2">
          <span className="font-semibold">{experiencia}</span>
          {t.cargos.length > 0 && <span className="text-ink-muted"> · {t.cargos.join(", ")}</span>}
        </span>
      </p>

      {habilidades.length > 0 && (
        <ul aria-label="Habilidades" className="flex flex-wrap gap-1.5">
          {habilidades.slice(0, NO_CARTAO).map((h) => (
            <li key={h} className={classesHabilidade}>
              {h}
            </li>
          ))}
          {habilidades.length > NO_CARTAO && <li className={classesMais}>+{habilidades.length - NO_CARTAO}</li>}
        </ul>
      )}

      <div className="mt-auto flex flex-col gap-3">
        {(estudo || t.cnh || turnos || agora) && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-body-sm text-ink-muted">
            {estudo && (
              <li className="flex items-center gap-1.5">
                <GraduationCap aria-hidden className="size-4 shrink-0" />
                {estudo}
              </li>
            )}
            {t.cnh && (
              <li className="flex items-center gap-1.5">
                <Car aria-hidden className="size-4 shrink-0" />
                CNH {t.cnh}
              </li>
            )}
            {turnos && (
              <li className="flex items-center gap-1.5">
                <Clock aria-hidden className="size-4 shrink-0" />
                {turnos.charAt(0).toUpperCase() + turnos.slice(1)}
              </li>
            )}
            {agora && (
              <li className="flex items-center gap-1.5">
                <History aria-hidden className="size-4 shrink-0" />
                Atualizou {tempoRelativo(t.atualizado_em, agora)}
              </li>
            )}
          </ul>
        )}
        {acao && <div className="relative z-10">{acao}</div>}
      </div>
    </article>
  );
}
