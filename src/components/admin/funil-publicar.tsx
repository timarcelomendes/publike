import { PASSOS_PUBLICAR } from "@/lib/passos-publicar";
import { Secao } from "./ui";

/**
 * O funil do /publicar em passos, no painel do admin: quantas vezes cada passo abriu nos últimos 30 dias e
 * quantas vagas saíram (o passo 6). A barra é a parte do passo 1; a queda mostra onde desistem.
 */
export function FunilDoPublicar({ funil }: { funil: Map<number, number> }) {
  const linhas = [
    ...PASSOS_PUBLICAR.map((p) => ({ passo: p.numero as number, nome: `${p.numero}. ${p.nome}` })),
    { passo: 6, nome: "Publicou" },
  ];
  const inicio = funil.get(1) ?? 0;
  return (
    <Secao
      titulo="Publicar vaga, passo a passo"
      descricao="Nos últimos 30 dias: quantas vezes cada passo abriu e quantas vagas saíram. Só a contagem do dia, sem saber quem."
    >
      {inicio === 0 ? (
        <p className="text-body-sm text-ink-muted">Ninguém abriu o Publicar nesse tempo.</p>
      ) : (
        <ol aria-label="Funil do publicar" className="flex flex-col gap-2">
          {linhas.map((l, i) => {
            const n = funil.get(l.passo) ?? 0;
            const parte = Math.round((100 * n) / inicio);
            const antes = i > 0 ? (funil.get(linhas[i - 1].passo) ?? 0) : 0;
            const saiu = i > 0 && antes > 0 ? Math.max(0, Math.round((100 * (antes - n)) / antes)) : null;
            return (
              <li key={l.passo} className="grid grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] items-center gap-3">
                <span className="truncate text-body-sm">{l.nome}</span>
                <span aria-hidden className="h-2.5 overflow-hidden rounded-pill bg-surface-300">
                  <span
                    className={`block h-full rounded-pill ${l.passo === 6 ? "bg-cerrado" : "bg-ink"}`}
                    style={{ width: `${Math.min(100, parte)}%` }}
                  />
                </span>
                <span className="text-body-sm whitespace-nowrap tabular-nums">
                  <strong className="font-semibold">{n}</strong> · {parte}%
                  {saiu ? <span className="text-terra-text"> (−{saiu}%)</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Secao>
  );
}
