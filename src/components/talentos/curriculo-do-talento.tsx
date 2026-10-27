import { Briefcase, Car, Clock, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";
import { CurriculoResumo } from "@/components/curriculo-resumo";
import { classesHabilidade, textoDisponibilidade } from "@/components/talentos/cartao-talento";
import { nomeEscolaridade } from "@/lib/constantes";
import type { TalentoCompleto } from "@/lib/servidor/talentos";
import { textoDaExperiencia, type TalentoResumo } from "@/lib/talentos";
import type { Estudo } from "@/lib/tipos";

/** Uma parte do currículo, com o título no nível que a página pede. */
function Parte({ titulo, nivel, children }: { titulo: string; nivel: 2 | 3; children: ReactNode }) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <section className="flex flex-col gap-2">
      <Titulo className="text-h3">{titulo}</Titulo>
      {children}
    </section>
  );
}

/**
 * O currículo de quem está na aba Talentos (a página do talento e o perfil da pessoa): todo mundo vê
 * o resumo (as habilidades, os cargos sem as empresas, os cursos, os estudos, a CNH e os horários);
 * com `cv` (empresa, comércio e agência que entraram), o completo: onde trabalhou, as datas e o que fazia.
 * `nivel`: o nível dos títulos das partes (3 quando a página já tem um título "Currículo" em cima).
 * `tituloDoCompleto`: o título em cima do currículo completo (null: sem título).
 */
export function CurriculoDoTalento({
  resumo,
  cv,
  hoje,
  nivel = 2,
  tituloDoCompleto = "Currículo",
}: {
  resumo: TalentoResumo & { curso: string | null; estudos: Estudo[] };
  cv: TalentoCompleto | null;
  /** "2026-10" (do servidor), para a duração do trabalho atual */
  hoje: string;
  nivel?: 2 | 3;
  tituloDoCompleto?: string | null;
}) {
  const estudo = nomeEscolaridade(resumo.escolaridade);
  const turnos = textoDisponibilidade(resumo.disponibilidade);
  const completo = cv ? (
    <CurriculoResumo
      curriculo={{
        escolaridade: cv.escolaridade,
        curso: cv.curso,
        estudos: cv.estudos,
        experiencias: cv.experiencias,
        cursos: cv.cursos,
        cnh: cv.cnh,
        disponibilidade: cv.disponibilidade,
        arquivo: null,
        atualizado_em: cv.atualizado_em,
      }}
      linkPdf={null}
      hoje={hoje}
    />
  ) : null;

  return (
    <>
      {resumo.habilidades.length > 0 && (
        <Parte titulo="Habilidades e conhecimentos" nivel={nivel}>
          <ul className="flex flex-wrap gap-2">
            {resumo.habilidades.map((h) => (
              <li key={h} className={classesHabilidade}>
                {h}
              </li>
            ))}
          </ul>
        </Parte>
      )}

      {completo ? (
        tituloDoCompleto ? (
          <Parte titulo={tituloDoCompleto} nivel={nivel}>
            {completo}
          </Parte>
        ) : (
          completo
        )
      ) : (
        <>
          <Parte titulo="Experiência" nivel={nivel}>
            <p className="flex items-start gap-2 text-body">
              <Briefcase aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
              <span>
                {textoDaExperiencia(resumo.meses_experiencia, resumo.cargos.length > 0)}
                {resumo.cargos.length > 0 && <span className="text-ink-muted"> · {resumo.cargos.join(", ")}</span>}
              </span>
            </p>
          </Parte>
          {resumo.cursos.length > 0 && (
            <Parte titulo="Cursos" nivel={nivel}>
              <ul className="flex flex-wrap gap-2">
                {resumo.cursos.map((c) => (
                  <li key={c} className={classesHabilidade}>
                    {c}
                  </li>
                ))}
              </ul>
            </Parte>
          )}
          {(estudo || resumo.estudos.length > 0 || resumo.cnh || turnos) && (
            <ul className="flex flex-col gap-2 text-body">
              {estudo && (
                <li className="flex items-center gap-2">
                  <GraduationCap aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  <span>
                    {estudo}
                    {resumo.curso && <span className="text-ink-muted"> · {resumo.curso}</span>}
                  </span>
                </li>
              )}
              {resumo.estudos.map((e) => (
                <li key={`${e.nivel}-${e.curso}`} className="flex items-center gap-2">
                  <GraduationCap aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  <span>
                    {nomeEscolaridade(e.nivel)}
                    <span className="text-ink-muted"> · {e.curso}</span>
                  </span>
                </li>
              ))}
              {resumo.cnh && (
                <li className="flex items-center gap-2">
                  <Car aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  CNH categoria {resumo.cnh}
                </li>
              )}
              {turnos && (
                <li className="flex items-center gap-2">
                  <Clock aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  Pode trabalhar: {turnos}
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </>
  );
}
