import { Check, Clock3, Trophy, Users, X } from "lucide-react";
import Link from "next/link";
import { Avatar, Vazio } from "@/components/ui/basicos";
import { formatarLugar } from "@/lib/formato";
import {
  pontaDaTrilha,
  type CelulaDaTrilha,
  type ColunaDaTrilha,
  type EstadoDaCelula,
  type SituacaoNaTrilha,
} from "@/lib/trilha";

// A trilha dos candidatos (claude/plano-trilha-dos-candidatos.md): uma linha por candidato e as etapas da vaga em
// colunas, cada uma com a data, o ícone e o que aconteceu. Quem foi mais longe vem primeiro. Tocar no nome abre a
// ficha no quadro.

export type LinhaDaTrilha = {
  perfil_id: string;
  nome: string;
  foto: string | null;
  bairro: string | null;
  cidade: string;
  situacao: SituacaoNaTrilha;
  celulas: CelulaDaTrilha[];
};

export type FiltroDaTrilha = "todos" | SituacaoNaTrilha;

const DIA = 24 * 60 * 60 * 1000;

/** "6 nov." no horário de Goiânia */
function dataCurta(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );
}

/** "hoje", "há 1 dia", "há 6 dias" */
function haQuanto(iso: string, agora: number) {
  const dias = Math.floor((agora - new Date(iso).getTime()) / DIA);
  return dias <= 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

const SITUACOES: Record<SituacaoNaTrilha, { nome: string; classe: string }> = {
  andamento: { nome: "Em andamento", classe: "bg-ipe/20 text-ink" },
  contratado: { nome: "Contratado", classe: "bg-cerrado text-on-cerrado" },
  parou: { nome: "Não seguiu", classe: "bg-danger/12 text-danger" },
};

/** A seta de cada etapa (a primeira sem o recorte da esquerda). */
const SETA = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%, 12px 50%)";
const SETA_PRIMEIRA = "polygon(0 0, calc(100% - 12px) 0, 100% 50%, calc(100% - 12px) 100%, 0 100%)";

const FUNDO: Record<EstadoDaCelula, string> = {
  passou: "bg-cerrado/8",
  atual: "bg-ipe/18",
  parou: "bg-danger/8",
  contratado: "bg-cerrado/16",
};

const ICONE: Record<EstadoDaCelula, { classe: string; Icone: typeof Check; texto: string }> = {
  passou: { classe: "bg-cerrado text-on-cerrado", Icone: Check, texto: "passou" },
  atual: { classe: "bg-ipe text-on-ipe", Icone: Clock3, texto: "está aqui" },
  parou: { classe: "bg-danger text-white", Icone: X, texto: "parou aqui" },
  contratado: { classe: "bg-cerrado text-on-cerrado ring-4 ring-cerrado/25", Icone: Trophy, texto: "contratado" },
};

export function TrilhaCandidatos({
  anuncioId,
  colunas,
  linhas,
  filtro,
  agora,
}: {
  anuncioId: string;
  colunas: ColunaDaTrilha[];
  linhas: LinhaDaTrilha[];
  filtro: FiltroDaTrilha;
  agora: number;
}) {
  const conta = (s: SituacaoNaTrilha) => linhas.filter((l) => l.situacao === s).length;
  // quantos estão em cada etapa agora (a ponta de quem está em andamento)
  const aqui = colunas.map((_, i) => linhas.filter((l) => l.situacao === "andamento" && l.celulas[i]?.estado === "atual").length);
  // quem foi mais longe vem primeiro; depois os contratados; por último quem não seguiu
  const ordem: Record<SituacaoNaTrilha, number> = { andamento: 0, contratado: 1, parou: 2 };
  const visiveis = linhas
    .filter((l) => filtro === "todos" || l.situacao === filtro)
    .map((l) => ({ l, ponta: pontaDaTrilha(l.celulas) }))
    .sort((a, b) => ordem[a.l.situacao] - ordem[b.l.situacao] || b.ponta - a.ponta)
    .map((x) => x.l);

  const filtros: { valor: FiltroDaTrilha; nome: string; n: number }[] = [
    { valor: "todos", nome: "Todos", n: linhas.length },
    { valor: "andamento", nome: "Em andamento", n: conta("andamento") },
    { valor: "contratado", nome: "Contratados", n: conta("contratado") },
    { valor: "parou", nome: "Não seguiram", n: conta("parou") },
  ];

  if (!linhas.length)
    return (
      <Vazio icone={Users} titulo="Ninguém se candidatou ainda">
        Quando alguém curtir a vaga, a trilha de cada pessoa aparece aqui, etapa por etapa.
      </Vazio>
    );

  return (
    <section aria-label="Trilha dos candidatos" className="flex flex-col gap-4">
      {/* os números e o filtro numa linha só: cada número é também o atalho para ver só aqueles */}
      <nav aria-label="Mostrar" className="flex flex-wrap items-center gap-2">
        {filtros.map((f) => {
          const ativo = f.valor === filtro;
          const Marca = f.valor === "contratado" ? Trophy : f.valor === "parou" ? X : f.valor === "andamento" ? Clock3 : Users;
          return (
            <Link
              key={f.valor}
              href={f.valor === "todos" ? `/painel/anuncio/${anuncioId}/trilha` : `/painel/anuncio/${anuncioId}/trilha?ver=${f.valor}`}
              scroll={false}
              aria-current={ativo ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-pill border px-3.5 text-label transition-colors ${
                ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-200 text-ink hover:border-line-strong"
              }`}
            >
              <Marca aria-hidden className="size-4 shrink-0" />
              {f.nome}
              <span className={`tabular-nums ${ativo ? "" : "text-ink-muted"}`}>{f.n}</span>
            </Link>
          );
        })}
      </nav>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <table className="w-full min-w-max border-separate border-spacing-y-2 text-left">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-20 bg-surface-100 pr-3 pb-1 align-bottom text-label text-ink-muted">
                <span className="sr-only">Candidato</span>
              </th>
              {colunas.map((col, i) => (
                <th key={col.chave} scope="col" className="px-0.5 pb-1 align-bottom font-normal">
                  <span
                    className={`flex min-h-12 min-w-[6.25rem] flex-col justify-center bg-surface-300 sm:min-w-[7.25rem] py-1.5 pr-5 ${i === 0 ? "pl-4" : "pl-6"}`}
                    style={{ clipPath: i === 0 ? SETA_PRIMEIRA : SETA }}
                  >
                    <span className="text-label leading-tight">{col.nome}</span>
                    <span className="text-caption text-ink-muted">{aqui[i] ? `${aqui[i]} aqui agora` : " "}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <Linha key={l.perfil_id} anuncioId={anuncioId} linha={l} colunas={colunas} agora={agora} />
            ))}
          </tbody>
        </table>
      </div>
      {!visiveis.length && <p className="text-body-sm text-ink-muted">Ninguém aqui por enquanto.</p>}
    </section>
  );
}

function Linha({
  anuncioId,
  linha: l,
  colunas,
  agora,
}: {
  anuncioId: string;
  linha: LinhaDaTrilha;
  colunas: ColunaDaTrilha[];
  agora: number;
}) {
  const ponta = pontaDaTrilha(l.celulas);
  const situacao = SITUACOES[l.situacao];
  const parou = l.situacao === "parou";
  return (
    <tr className="group">
      <th
        scope="row"
        className="sticky left-0 z-10 rounded-l-lg border-y border-l border-line bg-surface-200 py-3 pr-3 pl-3 align-middle font-normal group-hover:bg-surface-300"
      >
        <span className="flex w-[7rem] items-center gap-3 sm:w-[12.5rem]">
          {/* no celular, sem a foto: sobra lugar para as etapas */}
          <span className="hidden shrink-0 sm:block">
            <Avatar
              nome={l.nome}
              foto={l.foto}
              tamanho={44}
              colorida
              className={parou ? "opacity-60 grayscale" : ""}
            />
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <Link
              href={`/painel/anuncio/${anuncioId}/quadro?candidato=${l.perfil_id}`}
              className="truncate text-label underline-offset-2 hover:underline"
              title={`Abrir a ficha de ${l.nome}`}
            >
              {l.nome}
            </Link>
            <span className="truncate text-caption text-ink-muted">{formatarLugar(l.bairro, l.cidade)}</span>
            <span
              className={`self-start rounded-pill px-2 py-0.5 text-caption font-semibold whitespace-nowrap ${situacao.classe}`}
            >
              {situacao.nome}
            </span>
          </span>
        </span>
      </th>
      {colunas.map((col, i) => {
        const c = l.celulas[i];
        const ultima = i === colunas.length - 1;
        // o fio entre as etapas: até a ponta (passa também pelas etapas puladas)
        const fioEsq = i > 0 && i <= ponta;
        const fioDir = i < ponta;
        const tracejado = (j: number) => l.celulas[j]?.estado !== "passou" && l.celulas[j]?.estado !== "contratado";
        return (
          <td
            key={col.chave}
            className={`border-y border-line bg-surface-200 px-0.5 py-2 align-middle group-hover:bg-surface-300 ${
              ultima ? "rounded-r-lg border-r pr-2" : ""
            }`}
          >
            <div
              className={`relative flex min-h-[6.5rem] min-w-[6.25rem] flex-col items-center justify-center gap-1.5 px-3 py-2 sm:min-w-[7.25rem] sm:px-3.5 ${
                c ? FUNDO[c.estado] : "bg-surface-100/60"
              }`}
              style={{ clipPath: i === 0 ? SETA_PRIMEIRA : SETA }}
            >
              {fioEsq && (
                <span
                  aria-hidden
                  className={`absolute top-1/2 left-0 w-1/2 border-t-2 ${tracejado(i) ? "border-dashed border-line-strong" : "border-cerrado/50"}`}
                />
              )}
              {fioDir && (
                <span
                  aria-hidden
                  className={`absolute top-1/2 right-0 w-1/2 border-t-2 ${tracejado(i + 1) ? "border-dashed border-line-strong" : "border-cerrado/50"}`}
                />
              )}
              {c ? (
                <Celula celula={c} etapa={col.nome} agora={agora} />
              ) : (
                <span className="sr-only">{col.nome}: ainda não chegou</span>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
}

function Celula({ celula: c, etapa, agora }: { celula: NonNullable<CelulaDaTrilha>; etapa: string; agora: number }) {
  const { classe, Icone, texto } = ICONE[c.estado];
  const tempo = c.estado === "atual" && c.em ? haQuanto(c.em, agora) : null;
  // parado há mais de 5 dias na mesma etapa: o tempo em destaque
  const parado = c.estado === "atual" && c.em ? agora - new Date(c.em).getTime() > 5 * DIA : false;
  return (
    <>
      <span className="relative h-4 text-caption font-semibold tabular-nums text-ink-muted">
        {c.em ? <time dateTime={c.em}>{dataCurta(c.em)}</time> : null}
      </span>
      <span
        aria-hidden
        className={`relative grid size-9 place-items-center rounded-pill shadow-card ring-2 ring-surface-200 ${classe}`}
      >
        <Icone className="size-[18px]" strokeWidth={2.5} />
      </span>
      <span className="relative flex min-h-8 flex-col items-center text-center text-caption leading-tight">
        {c.rotulo && <span className="font-semibold text-ink">{c.rotulo}</span>}
        {tempo && <span className={parado ? "font-semibold text-terra-text" : "text-ink-muted"}>{parado ? `parado ${tempo}` : tempo}</span>}
      </span>
      <span className="sr-only">
        {etapa}: {c.rotulo ?? texto}
        {c.em ? `, ${dataCurta(c.em)}` : ""}
      </span>
    </>
  );
}
