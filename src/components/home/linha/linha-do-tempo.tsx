import { Briefcase, CircleCheck, MapPinned, Wrench, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { hrefFiltros, RAIOS } from "@/lib/filtros";
import { horaNaLinha, montarLinha, quandoFoi } from "@/lib/linha-do-tempo";
import { chaveDaLinha, dadosDaLinha } from "@/lib/servidor/linha";
import { Vazio } from "../../ui/basicos";
import { BotaoLink } from "../../ui/botao";
import { ListaDaLinha } from "./lista-da-linha";
import { CartaoDoAceite, CartaoDoServico, TicketDaVaga } from "./objetos";
import { RegistrarVisita } from "./registrar-visita";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

// No computador: a hora, o nó no traço e o objeto. No celular, só o objeto (a hora vai para o canto dele).
const GRADE = "sm:grid sm:grid-cols-[56px_36px_minmax(0,1fr)] sm:gap-x-2.5";

// o nó tem o tom do tipo, como o cartão ao lado
const NO = {
  vaga: "bg-tom-vaga text-terra-text",
  servico: "bg-tom-servico text-cerrado-text",
  aceite: "bg-cerrado text-on-cerrado",
};

function No({ icone: Icone, tipo }: { icone: LucideIcon; tipo: keyof typeof NO }) {
  return (
    <span
      aria-hidden
      className={`relative z-[1] mt-2.5 hidden size-8 place-items-center justify-self-center rounded-pill shadow-[0_0_0_4px_var(--pk-surface-100)] sm:grid ${NO[tipo]}`}
    >
      <Icone className="size-4" />
    </span>
  );
}

function Ponto({ terra = false }: { terra?: boolean }) {
  return (
    <span
      aria-hidden
      className={`relative z-[1] hidden size-3 justify-self-center rounded-pill shadow-[0_0_0_5px_var(--pk-surface-100)] sm:block ${
        terra ? "bg-terra" : "bg-ink"
      }`}
    />
  );
}

/**
 * A linha do tempo da home: vagas, serviços e aceites, do mais novo para o mais antigo, com os
 * separadores de dia e a marca "Você parou aqui". `meio`: o que entra uma vez depois do 4º item,
 * só no celular (quem está contratando; no computador, fica em cima do mapa).
 */
export async function LinhaDoTempo({ searchParams, meio = null }: { searchParams: Parametros; meio?: ReactNode }) {
  const d = await dadosDaLinha(chaveDaLinha(await searchParams));
  if (!d.itens.length) {
    const maior = RAIOS[RAIOS.length - 1];
    return (
      <>
        <Vazio
          icone={MapPinned}
          titulo={d.aba === "servico" ? "Nenhum serviço por aqui ainda" : "Nada por aqui ainda"}
          acao={
            (d.filtros.tempo || d.filtros.raio < maior) && (
              <BotaoLink href={hrefFiltros(d.filtrosDaBusca, { raio: maior, tempo: null })} scroll={false}>
                Buscar até {maior} km
              </BotaoLink>
            )
          }
        >
          {d.filtros.q || d.filtros.categoria || d.filtros.turno
            ? "Tente outra palavra, outra categoria ou uma distância maior."
            : "Quando aparecer algo novo perto de você, entra aqui."}
        </Vazio>
        <RegistrarVisita />
      </>
    );
  }

  const blocos: ReactNode[] = [];
  const contam: boolean[] = [];
  let n = 0;
  for (const p of montarLinha(d.itens, d.marca, d.agora)) {
    if (p.tipo === "dia") {
      blocos.push(
        <div key={p.chave} className={`${GRADE} items-center pt-2`}>
          <span className="hidden sm:block" />
          <Ponto />
          <h2 className="flex items-baseline gap-2.5 font-display text-[22px] leading-7 font-bold tracking-[-0.01em] sm:text-[24px] sm:leading-[30px]">
            {p.titulo}
            <span className="font-sans text-body-sm font-medium tracking-normal text-ink-muted">{p.data}</span>
          </h2>
        </div>,
      );
      contam.push(false);
    } else if (p.tipo === "marca") {
      blocos.push(
        <div key={p.chave} role="separator" aria-label="Você parou aqui" className={`${GRADE} items-center py-1`}>
          <span className="hidden sm:block" />
          <Ponto terra />
          <p className="flex items-center gap-2.5 text-label whitespace-nowrap text-terra-text after:h-0 after:flex-1 after:border-t-2 after:border-dashed after:border-terra-text/45">
            Você parou aqui
            <span className="font-medium text-ink-muted">{quandoFoi(p.quando, d.agora)}</span>
          </p>
        </div>,
      );
      contam.push(false);
    } else {
      const { item } = p;
      const hora = horaNaLinha(Date.parse(item.quando), d.agora);
      const dados = item.dados;
      blocos.push(
        <div key={p.chave} className={`${GRADE} items-start`}>
          <span className="hidden pt-[18px] text-right text-body-sm leading-4 font-semibold text-ink-muted tabular-nums sm:block">
            {hora}
          </span>
          {"aceite" in dados ? (
            <>
              <No icone={CircleCheck} tipo="aceite" />
              <CartaoDoAceite m={dados.aceite} hora={hora} />
            </>
          ) : dados.anuncio.anuncio.tipo === "servico" ? (
            <>
              <No icone={Wrench} tipo="servico" />
              <CartaoDoServico item={dados.anuncio} hora={hora} usuarioId={d.usuarioId} />
            </>
          ) : (
            <>
              <No icone={Briefcase} tipo="vaga" />
              <TicketDaVaga item={dados.anuncio} hora={hora} usuarioId={d.usuarioId} tempoDe={d.tempoDe} />
            </>
          )}
        </div>,
      );
      contam.push(true);
      n++;
      if (n === 4 && meio) {
        blocos.push(
          <div key="meio" className="lg:hidden">
            {meio}
          </div>,
        );
        contam.push(false);
      }
    }
  }

  return (
    <section aria-label="Linha do tempo" className="relative flex flex-col gap-2.5 pb-8 sm:gap-3">
      {/* o traço da linha, no meio da coluna dos nós */}
      <span aria-hidden className="absolute top-3 bottom-0 left-[83px] hidden w-0.5 rounded-pill bg-line sm:block" />
      <ListaDaLinha partes={blocos} contam={contam} />
      <RegistrarVisita />
    </section>
  );
}
