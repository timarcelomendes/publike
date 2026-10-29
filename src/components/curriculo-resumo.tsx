import { FileText } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/ui/basicos";
import { nomeDisponibilidade } from "@/lib/constantes";
import { textosDosEstudos } from "@/lib/estudos";
import { mesesDoPeriodo, textoDoPeriodo } from "@/lib/experiencia";
import type { EmpresasDosTrabalhos, EmpresaDoTrabalho } from "@/lib/servidor/empresas";
import type { Curriculo, Experiencia } from "@/lib/tipos";
import { VerMais } from "./ver-mais";

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

function ItemExperiencia({ e, hoje, empresa }: { e: Experiencia; hoje: string; empresa?: EmpresaDoTrabalho }) {
  const tempo = duracao(e, hoje);
  const periodo = textoDoPeriodo(e);
  const unidade = e.onde && e.unidade ? `, ${e.unidade}` : "";
  return (
    <li className="flex flex-col gap-0.5">
      <p className="text-label">
        {e.cargo}
        {e.onde && !empresa && (
          <span className="font-normal text-ink-muted">
            {" "}
            · {e.onde}
            {unidade}
          </span>
        )}
      </p>
      {/* a empresa tem conta no Publike: o logo e o link do perfil dela */}
      {e.onde && empresa && (
        <p className="flex items-center gap-2 text-ink-muted">
          <Avatar nome={empresa.nome} foto={empresa.foto} tamanho={20} forma="quadrada" />
          <span>
            <Link href={`/perfil/${empresa.id}`} className="text-ink underline-offset-2 hover:underline">
              {e.onde}
            </Link>
            {unidade}
          </span>
        </p>
      )}
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

/** No compacto (a ficha da Caixa de entrada), o que fica à vista; o resto abre com um toque. */
const NO_COMPACTO = { trabalhos: 3, pilulas: 8 };

/** Até onde mostrar: no compacto, o corte, se sobrarem pelo menos 2 (um só a mais não vale o toque). */
const corte = (total: number, ate: number, compacto: boolean) => (compacto && total > ate + 1 ? ate : total);

/** Habilidades e cursos: as pílulas e, no compacto, o "Mais 7" com o resto. */
function Pilulas({ itens, compacto }: { itens: string[]; compacto: boolean }) {
  const ate = corte(itens.length, NO_COMPACTO.pilulas, compacto);
  const pilula = (t: string) => (
    <li key={t} className="rounded-pill bg-surface-300 px-2.5 py-1">
      {t}
    </li>
  );
  return (
    <ul className="flex flex-wrap gap-1.5">
      {itens.slice(0, ate).map(pilula)}
      {itens.length > ate && (
        <VerMais item pilula mais={`Mais ${itens.length - ate}`} menos="Menos">
          {itens.slice(ate).map(pilula)}
        </VerMais>
      )}
    </ul>
  );
}

/**
 * O currículo como quem anunciou a vaga vê. `hoje` no formato "2026-10"
 * (vem do servidor, para a duração do trabalho atual). `compacto`: os 3 primeiros
 * trabalhos e 8 habilidades e cursos à vista, com o "Ver mais" para o resto.
 */
export function CurriculoResumo({
  curriculo,
  linkPdf,
  hoje,
  empresas,
  compacto = false,
}: {
  curriculo: Curriculo;
  linkPdf: string | null;
  hoje: string;
  /** as empresas das experiências que têm conta no Publike (`empresasDosTrabalhos`) */
  empresas?: EmpresasDosTrabalhos;
  compacto?: boolean;
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
  const trabalhos = curriculo.experiencias;
  const ate = corte(trabalhos.length, NO_COMPACTO.trabalhos, compacto);
  const trabalho = (e: Experiencia, i: number) => (
    <ItemExperiencia key={i} e={e} hoje={hoje} empresa={empresas?.[e.onde.trim()]} />
  );

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
          <Pilulas itens={habilidades} compacto={compacto} />
        </div>
      )}
      <div>
        <h4 className="mb-2 text-caption text-ink-muted uppercase">Experiência</h4>
        {trabalhos.length ? (
          <ul className="flex flex-col gap-3">
            {trabalhos.slice(0, ate).map(trabalho)}
            {trabalhos.length > ate && (
              <VerMais
                item
                mais={`Ver mais ${trabalhos.length - ate} ${trabalhos.length - ate === 1 ? "experiência" : "experiências"}`}
              >
                {trabalhos.slice(ate).map((e, i) => trabalho(e, ate + i))}
              </VerMais>
            )}
          </ul>
        ) : (
          <p className="text-ink-muted">Ainda sem experiência (primeiro emprego).</p>
        )}
      </div>
      {curriculo.cursos.length > 0 && (
        <div>
          <h4 className="mb-2 text-caption text-ink-muted uppercase">Cursos</h4>
          <Pilulas itens={curriculo.cursos} compacto={compacto} />
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
