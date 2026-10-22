import { Sparkles } from "lucide-react";
import Link from "next/link";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import { MODO_DEMO } from "@/lib/config";
import { estadosDeConexao } from "@/lib/servidor/conexoes";
import { contasPerto, nomeNaLista, oQueE } from "@/lib/servidor/contas-perto";
import { BotaoConectarCompacto } from "../conexoes/botao-conectar-compacto";
import { SeloVerificado } from "../selo-verificado";
import { Avatar, Container } from "../ui/basicos";
import { cidadeDaVisita } from "@/lib/servidor/cidade";

const DIAS = 30;

/**
 * Onde a lista aparece: "coluna", embaixo do cartão da conta (computador); "faixa", uma linha que
 * rola de lado (no meio da linha do tempo no celular e na home de quem contrata); "vitrine", a
 * seção da home do visitante (o Conectar leva a entrar na conta).
 */
type Jeito = "coluna" | "faixa" | "vitrine";
// a coluna fica presa ao rolar: 4 contas para caber na tela junto do cartão da conta
const QUANTOS: Record<Jeito, number> = { coluna: 4, faixa: 10, vitrine: 10 };

/**
 * Quem entrou no Publike nos últimos 30 dias, do mais perto para o mais longe, com o Conectar.
 * `total`: quantas contas novas no mês.
 */
async function contasNovas(quantos: number) {
  const { contas: novos, total, agora, usuario } = await contasPerto({ dias: DIAS, quantos });
  // o visitante não tem conexões (o Conectar leva a entrar)
  const estados = usuario ? await estadosDeConexao(novos.map((n) => n.id)) : new Map();
  return { novos, total, estados, agora, logado: Boolean(usuario) };
}

/** "8 contas novas nos últimos 30 dias" (só quando há mais do que a lista mostra). */
function textoDoTotal(total: number, mostrados: number) {
  return total > mostrados ? `${total} contas novas nos últimos ${DIAS} dias.` : null;
}

export async function NovosPerto({ jeito = "coluna" }: { jeito?: Jeito }) {
  if (MODO_DEMO) return null;
  const { novos, total, estados, agora, logado } = await contasNovas(QUANTOS[jeito]);
  // a coluna e a faixa são de quem entrou; a vitrine, de quem ainda não entrou
  if ((jeito === "vitrine") === logado || !novos.length) return null;
  const totalTexto = textoDoTotal(total, novos.length);

  if (jeito === "coluna") {
    return (
      <section
        aria-labelledby="novos-perto"
        className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card"
      >
        <div>
          <h2 id="novos-perto" className="flex items-center gap-1.5 text-label">
            <Sparkles aria-hidden className="size-4 text-terra-text" />
            Chegaram perto de você
          </h2>
          {totalTexto && <p className="mt-0.5 text-[13px] leading-[18px] text-ink-muted">{totalTexto}</p>}
        </div>
        <ul className="flex flex-col gap-3">
          {novos.map((n) => (
            // uma linha por conta: a foto, o nome com quando chegou e o Conectar só com o ícone
            <li key={n.id} className="flex items-center gap-2">
              <Link
                href={`/perfil/${n.id}`}
                title={`Chegou ${tempoRelativo(n.criado_em, agora)}`}
                className="flex min-w-0 flex-1 items-center gap-2.5 hover:underline"
              >
                <Avatar
                  nome={n.nome}
                  foto={n.foto}
                  tamanho={36}
                  forma={n.tipo === "pessoa" ? "redonda" : "quadrada"}
                  colorida
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-body-sm font-semibold">
                    <span className="truncate">{nomeNaLista(n)}</span>
                    {n.verificado && <SeloVerificado agencia={n.tipo === "agencia"} />}
                  </span>
                  <span className="block truncate text-[13px] leading-[18px] text-ink-muted">
                    {/* o tipo já aparece na forma da foto (pessoa redonda, empresa quadrada); quando chegou, na dica do link */}
                    {formatarLugar(n.bairro, n.cidade)}
                  </span>
                </span>
              </Link>
              <BotaoConectarCompacto
                outro={{ id: n.id, nome: n.nome, tipo: n.tipo }}
                estado={estados.get(n.id) ?? null}
                voltar="/"
                jeito="icone"
              />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  const vitrine = jeito === "vitrine";
  const cartoes = (
    <ul
      // relative: o texto do leitor de tela (sr-only, absoluto) fica dentro da rolagem e não alarga a página
      className={`sem-barra relative -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 ${
        vitrine
          ? "mt-4 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5"
          : // no celular rola de lado; do tablet em diante, uma grade de até 5 (o resto fica para o celular)
            "mt-3 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 md:grid-cols-4 lg:grid-cols-5 sm:[&>li:nth-child(n+6)]:hidden"
      }`}
    >
      {novos.map((n) => (
        <li
          key={n.id}
          className={`flex shrink-0 flex-col items-center gap-2 rounded-lg border border-line bg-surface-200 p-3.5 text-center shadow-card ${
            vitrine ? "w-44 sm:w-auto" : "w-40 sm:w-auto"
          }`}
        >
          <Link
            href={`/perfil/${n.id}`}
            className="flex min-w-0 flex-col items-center gap-1.5 self-stretch hover:underline"
          >
            <Avatar
              nome={n.nome}
              foto={n.foto}
              tamanho={56}
              forma={n.tipo === "pessoa" ? "redonda" : "quadrada"}
              colorida
            />
            <span className="flex max-w-full items-center justify-center gap-1 text-body-sm font-semibold">
              <span className="truncate">{nomeNaLista(n)}</span>
              {n.verificado && <SeloVerificado agencia={n.tipo === "agencia"} />}
            </span>
            <span className="-mt-1 block max-w-full truncate text-[13px] leading-[18px] text-ink-muted">
              {oQueE(n.tipo)} · {formatarLugar(n.bairro, n.cidade)}
            </span>
            <span className="-mt-1 block text-[12px] text-ink-muted">chegou {tempoRelativo(n.criado_em, agora)}</span>
          </Link>
          <div className="mt-auto">
            <BotaoConectarCompacto
              outro={{ id: n.id, nome: n.nome, tipo: n.tipo }}
              estado={estados.get(n.id) ?? null}
              voltar="/"
              jeito="pilula"
            />
          </div>
        </li>
      ))}
    </ul>
  );

  if (vitrine) {
    // a praça toda (a lista vem de todas as cidades dela): "Goiânia e região"
    const { praca } = await cidadeDaVisita();
    return (
      <Container className="mt-12 sm:mt-16">
        <section aria-labelledby="novos-no-publike">
          <h2 id="novos-no-publike" className="text-h2 sm:text-[28px] sm:leading-[34px]">
            Chegaram no Publike em {praca.nome}
          </h2>
          <p className="mt-1 text-body text-ink-muted">
            {totalTexto ?? "Gente e empresas que entraram nos últimos 30 dias."} Conecte-se para conversar e indicar
            trabalho.
          </p>
          {cartoes}
        </section>
      </Container>
    );
  }

  return (
    <section aria-labelledby="novos-perto-faixa" className="flex flex-col">
      <h2 id="novos-perto-faixa" className="flex items-center gap-1.5 text-h3">
        <Sparkles aria-hidden className="size-5 text-terra-text" />
        Chegaram perto de você
      </h2>
      {totalTexto && <p className="mt-0.5 text-body-sm text-ink-muted">{totalTexto}</p>}
      {cartoes}
    </section>
  );
}
