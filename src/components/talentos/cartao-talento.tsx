import { Briefcase, Car, Clock, GraduationCap, MapPin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import { formatarLugar } from "@/lib/formato";
import { textoDaExperiencia, tituloDoTalento, type TalentoResumo } from "@/lib/talentos";
import { Avatar } from "../ui/basicos";

/** Quantas habilidades aparecem no cartão (o resto vira "+3"). */
const NO_CARTAO = 4;

/** Cada habilidade: uma pílula clara, em letra normal (não é um selo). */
const pilula = "inline-flex items-center rounded-pill px-2.5 py-1 text-body-sm";
export const classesHabilidade = `${pilula} bg-surface-300 text-ink`;
const classesMais = `${pilula} border border-line-strong text-ink-muted`;

/** "Pode de manhã, à tarde e no fim de semana". */
export function textoDisponibilidade(lista: string[]) {
  const nomes = lista.map((d) => nomeDisponibilidade(d).toLowerCase());
  if (!nomes.length) return null;
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

/**
 * Uma pessoa na aba Talentos: o que faz, onde mora (bairro), a experiência (os cargos, sem as
 * empresas) e as habilidades. Sem foto e com o nome encurtado; o cartão todo abre a página dela.
 * `acao` (o botão Conectar, para empresas) fica por cima do link do cartão.
 */
export function CartaoTalento({ t, acao }: { t: TalentoResumo; acao?: ReactNode }) {
  const estudo = nomeEscolaridade(t.escolaridade);
  const turnos = textoDisponibilidade(t.disponibilidade);
  const habilidades = t.habilidades.length ? t.habilidades : t.cursos;
  return (
    <article className="relative flex h-full flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card transition-shadow hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar nome={t.nome} tamanho={44} />
        <div className="min-w-0 flex-1">
          <h2 className="text-h3 break-words">
            <Link
              href={`/talentos/${t.perfil_id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
            >
              {tituloDoTalento(t)}
            </Link>
          </h2>
          <p className="flex items-center gap-1 text-body-sm text-ink-muted">
            <span className="shrink-0">{t.nome}</span>
            <span aria-hidden>·</span>
            <MapPin aria-hidden className="size-3.5 shrink-0" />
            <span className="truncate">{formatarLugar(t.bairro, t.cidade)}</span>
          </p>
        </div>
      </div>

      <p className="flex items-start gap-2 text-body-sm">
        <Briefcase aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        <span>
          {textoDaExperiencia(t.meses_experiencia)}
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
        {(estudo || t.cnh || turnos) && (
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
          </ul>
        )}
        {acao && <div className="relative z-10">{acao}</div>}
      </div>
    </article>
  );
}
