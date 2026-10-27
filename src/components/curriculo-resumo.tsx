import { FileText } from "lucide-react";
import { nomeDisponibilidade } from "@/lib/constantes";
import { textosDosEstudos } from "@/lib/estudos";
import { mesesDoPeriodo, textoDoPeriodo } from "@/lib/experiencia";
import type { Curriculo, Experiencia } from "@/lib/tipos";

/** Quanto tempo ficou: "1 ano e 5 meses", "8 meses" (sem as datas, nada). */
function duracao(e: Experiencia, hoje: string) {
  const total = mesesDoPeriodo(e, hoje);
  if (!total) return null;
  const anos = Math.floor(total / 12);
  const meses = total % 12;
  const partes = [
    anos ? `${anos} ${anos === 1 ? "ano" : "anos"}` : "",
    meses ? `${meses} ${meses === 1 ? "mês" : "meses"}` : "",
  ].filter(Boolean);
  return partes.join(" e ");
}

function ItemExperiencia({ e, hoje }: { e: Experiencia; hoje: string }) {
  const tempo = duracao(e, hoje);
  const periodo = textoDoPeriodo(e);
  return (
    <li className="flex flex-col gap-0.5">
      <p className="text-label">
        {e.cargo}
        {e.onde && <span className="font-normal text-ink-muted"> · {e.onde}</span>}
      </p>
      {periodo && (
        <p className="text-body-sm text-ink-muted">
          {periodo}
          {tempo && ` (${tempo})`}
        </p>
      )}
      {e.descricao && <p className="text-body-sm">{e.descricao}</p>}
    </li>
  );
}

/**
 * O currículo como quem anunciou a vaga vê. `hoje` no formato "2026-10"
 * (vem do servidor, para a duração do trabalho atual).
 */
export function CurriculoResumo({
  curriculo,
  linkPdf,
  hoje,
}: {
  curriculo: Curriculo;
  linkPdf: string | null;
  hoje: string;
}) {
  // o mais alto primeiro e, embaixo, os outros (técnico, outra faculdade, pós)
  const estudos = textosDosEstudos(curriculo);
  const habilidades = curriculo.habilidades ?? [];
  const linhas: { rotulo: string; valor: string | string[] }[] = [];
  if (curriculo.titulo) linhas.push({ rotulo: "O que faz", valor: curriculo.titulo });
  if (estudos.length) linhas.push({ rotulo: "Estudos", valor: estudos });
  if (curriculo.cnh) linhas.push({ rotulo: "CNH", valor: `Categoria ${curriculo.cnh}` });
  if (curriculo.disponibilidade.length)
    linhas.push({ rotulo: "Pode trabalhar", valor: curriculo.disponibilidade.map(nomeDisponibilidade).join(", ") });

  return (
    <div className="flex flex-col gap-4 text-body-sm">
      {linhas.length > 0 && (
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          {linhas.map((l) => (
            <div key={l.rotulo} className="contents">
              <dt className="text-ink-muted">{l.rotulo}</dt>
              <dd className="mb-1 sm:mb-0">
                {Array.isArray(l.valor)
                  ? l.valor.map((v) => (
                      <span key={v} className="block">
                        {v}
                      </span>
                    ))
                  : l.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {habilidades.length > 0 && (
        <div>
          <h4 className="mb-2 text-caption text-ink-muted uppercase">Habilidades</h4>
          <ul className="flex flex-wrap gap-1.5">
            {habilidades.map((h) => (
              <li key={h} className="rounded-pill bg-surface-300 px-2.5 py-1">
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <h4 className="mb-2 text-caption text-ink-muted uppercase">Experiência</h4>
        {curriculo.experiencias.length ? (
          <ul className="flex flex-col gap-3">
            {curriculo.experiencias.map((e, i) => (
              <ItemExperiencia key={i} e={e} hoje={hoje} />
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">Ainda sem experiência (primeiro emprego).</p>
        )}
      </div>
      {curriculo.cursos.length > 0 && (
        <div>
          <h4 className="mb-2 text-caption text-ink-muted uppercase">Cursos</h4>
          <ul className="flex flex-wrap gap-1.5">
            {curriculo.cursos.map((c) => (
              <li key={c} className="rounded-pill bg-surface-300 px-2.5 py-1">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {linkPdf && (
        <a
          href={linkPdf}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-md border border-line-strong bg-surface-200 px-4 text-label hover:bg-surface-300"
        >
          <FileText aria-hidden className="size-[18px]" />
          Abrir currículo em PDF
        </a>
      )}
    </div>
  );
}
