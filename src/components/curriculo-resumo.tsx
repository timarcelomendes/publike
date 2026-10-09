import { FileText } from "lucide-react";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import type { Curriculo, Experiencia } from "@/lib/tipos";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2024-03" → "mar/2024" */
function mes(valor: string) {
  const [ano, m] = valor.split("-");
  const i = Number(m) - 1;
  return MESES[i] ? `${MESES[i]}/${ano}` : valor;
}

/** Quanto tempo ficou: "1 ano e 5 meses", "8 meses". */
function duracao(inicio: string, fim: string | null, hoje: string) {
  const [a1, m1] = inicio.split("-").map(Number);
  const [a2, m2] = (fim ?? hoje).split("-").map(Number);
  const total = (a2 - a1) * 12 + (m2 - m1) + 1;
  if (!Number.isFinite(total) || total < 1) return null;
  const anos = Math.floor(total / 12);
  const meses = total % 12;
  const partes = [
    anos ? `${anos} ${anos === 1 ? "ano" : "anos"}` : "",
    meses ? `${meses} ${meses === 1 ? "mês" : "meses"}` : "",
  ].filter(Boolean);
  return partes.join(" e ");
}

function ItemExperiencia({ e, hoje }: { e: Experiencia; hoje: string }) {
  const tempo = duracao(e.inicio, e.fim, hoje);
  return (
    <li className="flex flex-col gap-0.5">
      <p className="text-label">
        {e.cargo}
        {e.onde && <span className="font-normal text-ink-muted"> · {e.onde}</span>}
      </p>
      <p className="text-body-sm text-ink-muted">
        {mes(e.inicio)} – {e.fim ? mes(e.fim) : "atual"}
        {tempo && ` (${tempo})`}
      </p>
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
  const estudo = nomeEscolaridade(curriculo.escolaridade);
  const linhas: { rotulo: string; valor: string }[] = [];
  if (estudo) linhas.push({ rotulo: "Estudos", valor: curriculo.curso ? `${estudo} · ${curriculo.curso}` : estudo });
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
              <dd className="mb-1 sm:mb-0">{l.valor}</dd>
            </div>
          ))}
        </dl>
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
          <h4 className="mb-2 text-caption text-ink-muted uppercase">Cursos e habilidades</h4>
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
