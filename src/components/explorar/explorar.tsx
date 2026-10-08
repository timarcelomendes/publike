import { MapPinned, SearchX } from "lucide-react";
import { buscarAnuncios, obterUsuario } from "@/lib/dados";
import { descreverOrigem, hrefFiltros, lerFiltros, RAIOS } from "@/lib/filtros";
import { formatarLugar, formatarValor, primeiro } from "@/lib/formato";
import { agoraDaRequisicao } from "@/lib/tempo";
import { CardAnuncio, EsqueletoCards } from "../card-anuncio";
import { Aviso, Container, Esqueleto, Vazio } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";
import { BarraBusca } from "./barra-busca";
import { VisaoExplorar } from "./visao-explorar";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

export async function Explorar({ searchParams }: { searchParams: Parametros }) {
  const parametros = await searchParams;
  const filtros = lerFiltros(parametros);
  const agora = await agoraDaRequisicao();
  const [anuncios, usuario] = await Promise.all([buscarAnuncios(filtros, agora), obterUsuario()]);

  const pontos = anuncios.map((a) => ({
    id: a.id,
    lat: a.lat,
    lng: a.lng,
    titulo: a.titulo,
    tipo: a.tipo,
    lugar: formatarLugar(a.bairro, a.cidade),
    valor: formatarValor(a.pagamento_valor, a.pagamento_unidade, a.beneficios),
  }));

  const n = anuncios.length;
  const nome = filtros.tipo === "vaga" ? ["vaga", "vagas"] : filtros.tipo === "servico" ? ["serviço", "serviços"] : ["oportunidade", "oportunidades"];
  const contagem = n === 0 ? `Nenhum resultado` : `${n >= 60 ? "60+" : n} ${n === 1 ? nome[0] : nome[1]}`;
  const maiorRaio = RAIOS[RAIOS.length - 1];

  const lista =
    n > 0 ? (
      <div className="grid gap-4 sm:grid-cols-2">
        {anuncios.map((a) => (
          <CardAnuncio key={a.id} anuncio={a} agora={agora} usuarioId={usuario?.id ?? null} />
        ))}
      </div>
    ) : (
      <Vazio
        icone={filtros.q || filtros.categoria ? SearchX : MapPinned}
        titulo="Nada por aqui ainda"
        acao={
          <>
            {filtros.raio < maiorRaio && (
              <BotaoLink href={hrefFiltros(filtros, { raio: maiorRaio })} scroll={false}>
                Buscar até {maiorRaio} km
              </BotaoLink>
            )}
            <BotaoLink href="/publicar">Publicar grátis</BotaoLink>
          </>
        }
      >
        {filtros.q || filtros.categoria
          ? "Tente outra palavra, outra categoria ou uma distância maior."
          : "Ainda não há anúncios nesta área. Que tal ser o primeiro a publicar?"}
      </Vazio>
    );

  return (
    <Container className="pt-6">
      {primeiro(parametros.conta) === "excluida" && (
        <Aviso tipo="sucesso" className="mb-6" titulo="Sua conta foi excluída.">
          Apagamos seu perfil, seus anúncios e suas curtidas. Obrigado por ter usado o Publike.
        </Aviso>
      )}
      <BarraBusca filtros={filtros} />
      <div className="mt-8 mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-h2" aria-live="polite">
          {contagem}
        </h2>
        <p className="text-body-sm text-ink-muted">
          em até {filtros.raio} km {descreverOrigem(filtros.origem)}
        </p>
      </div>
      <VisaoExplorar lista={lista} pontos={pontos} filtros={filtros} />
    </Container>
  );
}

export function ExplorarEsqueleto() {
  return (
    <Container className="pt-6" aria-busy="true">
      <Esqueleto className="h-12 w-full" />
      <div className="mt-4 flex gap-2">
        <Esqueleto className="h-10 w-20 rounded-pill" />
        <Esqueleto className="h-10 w-20 rounded-pill" />
        <Esqueleto className="h-10 w-24 rounded-pill" />
      </div>
      <div className="mt-4 flex gap-2 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Esqueleto key={i} className="h-10 w-36 shrink-0 rounded-pill" />
        ))}
      </div>
      <Esqueleto className="mt-8 mb-4 h-8 w-48" />
      <div className="lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-6">
        <EsqueletoCards />
        <Esqueleto className="hidden h-[calc(100dvh-7rem)] rounded-lg lg:block" />
      </div>
    </Container>
  );
}
