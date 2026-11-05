import Link from "next/link";
import { formatarDistancia, formatarLugar, valorDoAnuncio } from "@/lib/formato";
import { pracaDaCidade } from "@/lib/pracas";
import {
  maisVagasDaEmpresa,
  vagasParecidas,
  type QuemVe,
  type VagaDaFaixa,
  type VagaDaTela,
} from "@/lib/servidor/vagas-da-vaga";
import { SeloMatch } from "../match-vaga";
import { Avatar, fundoDoNome } from "../ui/basicos";
import { FaixaDeVagas, FaixaItem } from "./faixa-de-vagas";

/**
 * O fim da tela da vaga (claude/plano-carrossel-na-vaga.md): "Vagas parecidas" (as da mesma função na região) e
 * "Mais vagas de <quem publicou>". Sem nenhuma vaga, a faixa não aparece; sem as duas, nada.
 */
export async function VagasDaVaga({ vaga, ve, agora }: { vaga: VagaDaTela; ve: QuemVe; agora: number }) {
  const [parecidas, daEmpresa] = await Promise.all([
    vagasParecidas(vaga, ve, agora).catch(() => [] as VagaDaFaixa[]),
    maisVagasDaEmpresa(vaga, ve, agora).catch(() => null),
  ]);
  if (!parecidas.length && !daEmpresa) return null;
  const regiao = pracaDaCidade(vaga.cidade)?.nome ?? vaga.cidade;
  return (
    <div>
      {parecidas.length > 0 && (
        <FaixaDeVagas
          titulo="Vagas parecidas"
          subtitulo={`Da mesma função, em ${regiao}${ve.quem ? ". O % é o quanto cada uma combina com seu currículo" : ""}`}
        >
          {parecidas.map((v) => (
            <FaixaItem key={v.id}>
              <CartaoDaFaixa v={v} comQuemPublicou />
            </FaixaItem>
          ))}
        </FaixaDeVagas>
      )}
      {daEmpresa && (
        <FaixaDeVagas
          titulo={`Mais vagas de ${daEmpresa.autor.nome}`}
          subtitulo={
            daEmpresa.total === 1 ? "1 outra vaga no ar" : `${daEmpresa.total} outras vagas no ar, das mais novas`
          }
          verTodas={{ href: `/perfil/${vaga.autor_id}/vagas`, rotulo: "Ver todas" }}
        >
          {daEmpresa.vagas.map((v) => (
            <FaixaItem key={v.id}>
              <CartaoDaFaixa v={v} />
            </FaixaItem>
          ))}
        </FaixaDeVagas>
      )}
    </div>
  );
}

/** O cartão da faixa: a cor e a foto de quem publicou (como as "Novas perto de você" da home), o título e o resto. */
function CartaoDaFaixa({ v, comQuemPublicou = false }: { v: VagaDaFaixa; comQuemPublicou?: boolean }) {
  const distancia = formatarDistancia(v.km);
  return (
    <article className="h-full">
      <Link
        href={`/anuncio/${v.id}`}
        className="flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <span aria-hidden className={`relative block h-14 shrink-0 ${fundoDoNome(v.autor.nome)}`}>
          <span className="absolute -bottom-5 left-4 rounded-md bg-surface-200 p-0.5 shadow-card">
            <Avatar
              nome={v.autor.nome}
              foto={v.autor.foto}
              tamanho={40}
              forma={v.autor.tipo === "pessoa" ? "redonda" : "quadrada"}
              colorida
            />
          </span>
        </span>
        <span className="flex flex-1 flex-col gap-1 px-4 pt-8 pb-4">
          <h3 className="line-clamp-2 font-display text-h3 leading-snug">{v.titulo}</h3>
          {comQuemPublicou && <span className="truncate text-body-sm text-ink-muted">{v.autor.nome}</span>}
          {v.contratante && <span className="truncate text-body-sm text-ink-muted">Para {v.contratante}</span>}
          <span className="text-body-sm font-semibold text-terra-text">
            {formatarLugar(v.bairro, v.cidade)}
            {distancia ? ` · ${distancia}` : ""}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2">
            <span className="text-body font-bold">{valorDoAnuncio(v)}</span>
            {v.match && <SeloMatch match={v.match} />}
          </span>
        </span>
      </Link>
    </article>
  );
}
