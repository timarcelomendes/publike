import { formatarNumero } from "@/lib/formato";

type Dia = { dia: string; contas: number; anuncios: number; curtidas: number };

function diaMes(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/** Barras por dia (últimos 30 dias). Sem biblioteca: SVG simples, que escala com a largura. */
function Barras({ titulo, valores, dias }: { titulo: string; valores: number[]; dias: string[] }) {
  const total = valores.reduce((a, b) => a + b, 0);
  const maior = Math.max(...valores, 0);
  const iMaior = valores.indexOf(maior);
  const largura = valores.length * 10;
  const altura = 56;
  const descricao =
    total === 0
      ? `${titulo}: nenhum nos últimos 30 dias.`
      : `${titulo}: ${total} nos últimos 30 dias; o dia com mais foi ${diaMes(dias[iMaior])}, com ${maior}.`;
  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-label">{titulo}</span>
        <span className="text-body-sm text-ink-muted">{formatarNumero(total)} em 30 dias</span>
      </figcaption>
      <svg viewBox={`0 0 ${largura} ${altura}`} preserveAspectRatio="none" role="img" aria-label={descricao} className="h-16 w-full">
        {valores.map((v, i) => {
          const h = maior ? Math.max(v > 0 ? 3 : 1, (v / maior) * (altura - 2)) : 1;
          return (
            <rect
              key={dias[i]}
              x={i * 10 + 1}
              y={altura - h}
              width={8}
              height={h}
              rx={1.5}
              className={v > 0 ? "fill-ink" : "fill-line"}
            >
              <title>{`${diaMes(dias[i])}: ${v}`}</title>
            </rect>
          );
        })}
      </svg>
      <div aria-hidden className="flex justify-between text-caption font-normal text-ink-muted">
        <span>{dias[0] ? diaMes(dias[0]) : ""}</span>
        <span>hoje</span>
      </div>
    </figure>
  );
}

export function GraficoDias({ dias }: { dias: Dia[] }) {
  const datas = dias.map((d) => d.dia);
  return (
    <div className="grid gap-6 md:grid-cols-3">
      <Barras titulo="Cadastros" valores={dias.map((d) => d.contas)} dias={datas} />
      <Barras titulo="Anúncios" valores={dias.map((d) => d.anuncios)} dias={datas} />
      <Barras titulo="Curtidas" valores={dias.map((d) => d.curtidas)} dias={datas} />
    </div>
  );
}

/** Lista com barra proporcional (categorias, bairros). */
export function Ranking({ itens }: { itens: { nome: string; n: number }[] }) {
  const maior = Math.max(...itens.map((i) => i.n), 1);
  if (!itens.length) return <p className="text-body-sm text-ink-muted">Nenhum anúncio no ar ainda.</p>;
  return (
    <ol className="flex flex-col gap-2">
      {itens.map((i) => (
        <li key={i.nome} className="flex items-center gap-3 text-body-sm">
          <span className="w-40 shrink-0 truncate sm:w-48">{i.nome}</span>
          <span className="h-2 flex-1 rounded-pill bg-surface-300">
            <span className="block h-2 rounded-pill bg-ink" style={{ width: `${(i.n / maior) * 100}%` }} />
          </span>
          <span className="w-8 text-right tabular-nums text-ink-muted">{i.n}</span>
        </li>
      ))}
    </ol>
  );
}
