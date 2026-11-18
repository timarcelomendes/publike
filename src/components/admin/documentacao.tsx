import { Fragment, type ReactNode } from "react";
import type { NotaTecnica } from "@/lib/documentacao";

// As peças da Documentação técnica do Admin (src/app/admin/documentacao): o texto das notas (o `código`, o **negrito**
// e os [links] do AGENTS.md), com o que foi buscado marcado, e a nota que abre e fecha.

/** "2026-11-18" → "18/11/2026" */
export function dataCurta(iso: string | null) {
  if (!iso) return null;
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Marca as palavras buscadas no texto (sem diferença de acento e de maiúscula). */
function marcar(texto: string, busca: string): ReactNode {
  const palavras = busca
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => p.length >= 2);
  if (!palavras.length || !texto) return texto;
  // o texto sem acento, letra a letra, e de qual posição do original veio cada letra
  let simples = "";
  const origem: number[] = [];
  for (let i = 0; i < texto.length; i++) {
    const letra = texto[i].normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    for (const l of letra) {
      simples += l;
      origem.push(i);
    }
  }
  const trechos: [number, number][] = [];
  for (const p of palavras) {
    for (let i = simples.indexOf(p); i >= 0; i = simples.indexOf(p, i + p.length)) {
      trechos.push([origem[i], origem[i + p.length - 1] + 1]);
    }
  }
  if (!trechos.length) return texto;
  trechos.sort((a, b) => a[0] - b[0]);
  const juntos: [number, number][] = [];
  for (const t of trechos) {
    const ultimo = juntos.at(-1);
    if (ultimo && t[0] <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], t[1]);
    else juntos.push([...t]);
  }
  const partes: ReactNode[] = [];
  let desde = 0;
  juntos.forEach(([a, b], i) => {
    if (a > desde) partes.push(texto.slice(desde, a));
    partes.push(
      <mark key={i} className="rounded-sm bg-terra-soft px-0.5 text-ink">
        {texto.slice(a, b)}
      </mark>,
    );
    desde = b;
  });
  if (desde < texto.length) partes.push(texto.slice(desde));
  return partes;
}

const MARCAS = /(`[^`]+`|\*\*[^*]+?\*\*|\[[^\]]+\]\([^)\s]+\))/g;

/** Uma linha do texto técnico: o `código`, o **negrito** e os [links](...), com a busca marcada. */
export function TextoTecnico({ texto, busca = "" }: { texto: string; busca?: string }) {
  return (
    <>
      {texto.split(MARCAS).map((parte, i) => {
        if (!parte) return null;
        if (parte.length > 2 && parte.startsWith("`") && parte.endsWith("`")) {
          return (
            <code key={i} className="rounded-sm bg-surface-300 px-1 font-mono text-[0.9em] break-words">
              {marcar(parte.slice(1, -1), busca)}
            </code>
          );
        }
        if (parte.startsWith("**") && parte.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold">
              {marcar(parte.slice(2, -2), busca)}
            </strong>
          );
        }
        const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(parte);
        if (link) {
          const fora = /^https?:\/\//.test(link[2]);
          return (
            <a
              key={i}
              href={link[2]}
              className="underline underline-offset-2"
              {...(fora ? { target: "_blank", rel: "noreferrer" } : {})}
            >
              {marcar(link[1], busca)}
            </a>
          );
        }
        return <Fragment key={i}>{marcar(parte, busca)}</Fragment>;
      })}
    </>
  );
}

/** As linhas de uma nota: a primeira é o texto; as recuadas de baixo, os itens ("- ") ou a continuação. */
export function CorpoDaNota({ linhas, busca }: { linhas: string[]; busca: string }) {
  const blocos: ({ tipo: "p"; texto: string } | { tipo: "lista"; itens: string[] })[] = [];
  for (const linha of linhas) {
    const item = /^\s*[-*] (.+)$/.exec(linha);
    const ultimo = blocos.at(-1);
    if (item && blocos.length) {
      if (ultimo?.tipo === "lista") ultimo.itens.push(item[1]);
      else blocos.push({ tipo: "lista", itens: [item[1]] });
    } else if (ultimo?.tipo === "lista" && /^\s{4,}\S/.test(linha)) {
      // a continuação de um item (recuo maior)
      ultimo.itens[ultimo.itens.length - 1] += ` ${linha.trim()}`;
    } else {
      blocos.push({ tipo: "p", texto: linha.trim() });
    }
  }
  return (
    <div className="flex flex-col gap-2 text-body-sm leading-relaxed">
      {blocos.map((b, i) =>
        b.tipo === "p" ? (
          <p key={i}>
            <TextoTecnico texto={b.texto} busca={busca} />
          </p>
        ) : (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5">
            {b.itens.map((t, j) => (
              <li key={j}>
                <TextoTecnico texto={t} busca={busca} />
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

/** Uma nota que abre e fecha: o título e a data em cima; o texto inteiro ao abrir. */
export function NotaQueAbre({ nota, aberta, busca }: { nota: NotaTecnica; aberta: boolean; busca: string }) {
  return (
    <details id={nota.id} open={aberta} className="group scroll-mt-24 rounded-md border border-line bg-surface-100">
      <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-4 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 text-label">
          <span aria-hidden className="mr-2 inline-block text-ink-muted transition-transform group-open:rotate-90">
            ›
          </span>
          <TextoTecnico texto={nota.titulo} busca={busca} />
        </span>
        {nota.data && <span className="shrink-0 text-body-sm text-ink-muted tabular-nums">{dataCurta(nota.data)}</span>}
      </summary>
      <div className="border-t border-line px-4 py-3">
        <CorpoDaNota linhas={nota.linhas} busca={busca} />
      </div>
    </details>
  );
}
