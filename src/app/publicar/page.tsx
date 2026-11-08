import { FileUser } from "lucide-react";
import { diaADiaDasVagas } from "@/lib/servidor/jeito-de-trabalhar";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormAnuncio, type ValoresAnuncio } from "@/components/form-anuncio";
import { PublicarAnuncio } from "@/components/publicar-anuncio";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { SemBarraDeBaixo } from "@/components/sem-barra-de-baixo";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import {
  ajudaDaIADisponivel,
  meuCurriculoNaVitrine,
  obterAnuncio,
  obterMeuUltimoEndereco,
  obterUsuario,
} from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { MODELOS_ANUNCIO } from "@/lib/modelos-anuncio";
import { exigirPerfilCompleto } from "@/lib/sessao";
import { UUID } from "@/lib/validacao";
import { valoresDoAnuncio } from "@/lib/valores-anuncio";
import { conviteDoLink } from "@/lib/servidor/convite-do-link";
import { contatoPorDaVaga } from "@/lib/servidor/contato-por";
import { valoresDoConvite } from "@/lib/valores-convite";
import { obterTriagem } from "@/lib/servidor/triagem";
import { clienteDaVaga, clientesParaVaga } from "@/lib/servidor/clientes";
import { pedidoDaAgencia } from "@/lib/servidor/pedidos-do-cliente";
import { descricaoDoPedido } from "@/lib/pedidos-do-cliente";
import { temLugar } from "@/lib/clientes";
import { obterIntencao } from "@/lib/servidor/intencao";
import { ONDE_FUNCIONA, PRACA_PADRAO } from "@/lib/pracas";
import { cidadeDaVisita } from "@/lib/servidor/cidade";
import { funcaoSalvaDaVaga } from "@/lib/servidor/funcao";
import { padroesDaConta } from "@/lib/servidor/processo";
import { lerPerguntas } from "@/lib/vaga-extra";

export const metadata: Metadata = {
  title: "Publicar grátis",
  description: `Publique uma vaga em ${ONDE_FUNCIONA} e ache profissionais que moram perto. De graça para empresas de qualquer tamanho.`,
};

export default function Publicar({ searchParams }: PageProps<"/publicar">) {
  return (
    // o título fica na linha dos passos (no alto, presa ao rolar): o passo cabe na tela do computador
    <Container className="pt-3 pb-10 sm:pt-4 lg:pb-6">
      <SemBarraDeBaixo />
      <Suspense fallback={<Esqueleto className="h-[40rem] w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/publicar">["searchParams"] }) {
  if (MODO_DEMO) {
    return (
      <>
        <h1 className="text-h2">Publicar grátis</h1>
        <p className="mt-1 mb-5 text-body-sm text-ink-muted sm:text-body">
          Sem plano e sem limite de candidatos. Seu WhatsApp só aparece para quem você aceitar.
        </p>
        <Aviso tipo="alerta" className="mb-6" titulo="Modo demonstração">
          {MENSAGEM_DEMO}
        </Aviso>
        <FormAnuncio inicial={vazio(PRACA_PADRAO.cidade, "")} enderecoPublico />
      </>
    );
  }
  const sp = await searchParams;
  const pedida = primeiro(sp.copiar);
  const pedidaCopia = pedida && UUID.test(pedida) ? pedida : null;
  const continuar = primeiro(sp.continuar) === "1";
  // "Publicar o pedido grátis" do vazio de Serviços: o formulário abre com o modelo da área
  const pedidoModelo = primeiro(sp.modelo);
  const modelo = MODELOS_ANUNCIO.some((m) => m.id === pedidoModelo) ? (pedidoModelo ?? null) : null;
  // veio do link do convite do Publike: a vaga lida do anúncio da empresa vem pronta
  const lido = await conviteDoLink(primeiro(sp.convite));
  // convite de prestador: a página dele é a da vitrine de serviços
  if (lido?.tipo === "prestador") redirect(`/convite/${lido.token}`);
  const convite = lido;
  // sem conta dá para preencher a vaga: o rascunho fica no aparelho e sai depois de entrar
  if (!pedidaCopia && !(await obterUsuario())) {
    // a cidade de quem vê (onde disse que mora ou pelo endereço de internet)
    const base = vazio((await cidadeDaVisita()).cidade, "");
    const [intencao, ia] = await Promise.all([obterIntencao().catch(() => null), ajudaDaIADisponivel()]);
    const contrata = intencao === "contratar_pessoa" || intencao === "contratar_servico";
    return (
      <PublicarAnuncio
        antes={!convite && !contrata ? <ChamadaCurriculo /> : null}
        inicial={convite?.rascunho ? valoresDoConvite(convite.rascunho, base) : base}
        semConta
        // a foto e o texto da vaga também sem conta (o login só ao publicar)
        ia={ia}
        comModelos={!convite}
        modelo={convite ? null : modelo}
        // ainda não se sabe se a conta é de empresa: o endereço aparece como opcional
        enderecoPublico="talvez"
        convite={convite && { token: convite.token, nome: convite.nome, pronta: Boolean(convite.rascunho) }}
      />
    );
  }
  const voltar = pedidaCopia
    ? `/publicar?copiar=${pedidaCopia}`
    : continuar
      ? "/publicar?continuar=1"
      : convite
        ? `/publicar?convite=${convite.token}`
        : modelo
          ? `/publicar?modelo=${modelo}`
          : "/publicar";
  // agência: "Publicar vaga" na ficha do cliente chega com ?cliente=
  const pedidoCliente = primeiro(sp.cliente);
  const comCliente = pedidoCliente && UUID.test(pedidoCliente) ? pedidoCliente : null;
  const { perfil } = await exigirPerfilCompleto(
    comCliente && voltar === "/publicar" ? `/publicar?cliente=${comCliente}` : voltar,
  );
  const publico = perfil.tipo !== "pessoa";
  const agencia = perfil.tipo === "agencia";
  const clientePedido = agencia ? comCliente : null;
  // agência: "Publicar a vaga" do pedido do cliente chega com ?cliente=&pedido= (a vaga sai ligada ao pedido)
  const idDoPedido = primeiro(sp.pedido);
  const [ia, ultimo, original, clientes, pedidoLido, padroes] = await Promise.all([
    ajudaDaIADisponivel(),
    publico ? obterMeuUltimoEndereco() : null,
    pedidaCopia ? obterAnuncio(pedidaCopia) : null,
    agencia ? clientesParaVaga(clientePedido) : null,
    agencia && clientePedido && idDoPedido && UUID.test(idDoPedido) ? pedidoDaAgencia(idDoPedido) : null,
    // o padrão das vagas novas (Configurações › Candidatura; migração 20270315120000)
    publico ? padroesDaConta() : null,
  ]);
  const pedido = pedidoLido && pedidoLido.cliente_id === clientePedido && !pedidoLido.vaga ? pedidoLido : null;
  // "Publicar parecida": só de uma vaga sua (serviço se edita em "Meus serviços")
  const copia =
    original &&
    original.autor_id === perfil.id &&
    original.tipo === "vaga" &&
    !["em_analise", "removido"].includes(original.status)
      ? original
      : null;
  const [triagem, clienteDaCopia, funcaoDaCopia, contatoPorDaCopia, diaADiaDaCopia] = await Promise.all([
    copia ? obterTriagem(copia.id) : {},
    copia && clientes ? clienteDaVaga(copia.id) : null,
    // "Publicar parecida" e o "Volte a contratar": o cargo na carteira da vaga de antes também
    copia ? funcaoSalvaDaVaga(copia.id) : null,
    // e o jeito de conversar depois do match (só pelo chat, ou chat e WhatsApp)
    copia ? contatoPorDaVaga(copia.id) : null,
    // e como é o dia a dia (o jeito de trabalhar)
    copia ? diaADiaDasVagas([copia.id]) : null,
  ]);
  // a vaga é para este cliente: o nome, o jeito (confidencial ou não) e o lugar vêm dele
  const cliente = clientePedido ? (clientes?.find((c) => c.id === clientePedido) ?? null) : null;
  // comércio e empresa: a próxima vaga já vem com o endereço da última
  const inicialSemConvite = copia
    ? {
        ...valoresDoAnuncio(copia, { copiar: true, triagem }),
        funcao: funcaoDaCopia,
        ...(contatoPorDaCopia ? { contato_por: contatoPorDaCopia } : {}),
        dia_a_dia: diaADiaDaCopia?.get(copia.id) ?? [],
      }
    : ultimo
      ? {
          ...vazio(ultimo.cidade, ultimo.bairro),
          cep: ultimo.cep,
          endereco: ultimo.endereco,
          lat: ultimo.lat,
          lng: ultimo.lng,
        }
      : vazio(perfil.cidade, perfil.bairro ?? "");
  // a vaga nova (não a cópia) começa com o padrão da conta
  const comPadrao = (v: ValoresAnuncio): ValoresAnuncio => {
    if (copia || !padroes) return v;
    const perguntas = lerPerguntas(padroes.perguntas);
    return {
      ...v,
      curriculo_padrao: padroes.curriculo,
      ...(padroes.curriculo !== "regime" ? { pede_curriculo: padroes.curriculo === "sempre" } : {}),
      contato_direto: padroes.contato_direto,
      contato_por: padroes.contato_por,
      perguntas: perguntas.ok ? perguntas.perguntas : [],
    };
  };
  const inicialSemCliente =
    convite?.rascunho && !copia
      ? valoresDoConvite(convite.rascunho, comPadrao(inicialSemConvite))
      : comPadrao(inicialSemConvite);
  const inicial: ValoresAnuncio = cliente
    ? {
        ...inicialSemCliente,
        cliente_id: cliente.id,
        contratante: null,
        contratante_confidencial: cliente.confidencial,
        ...(temLugar(cliente)
          ? {
              cidade: cliente.cidade ?? inicialSemCliente.cidade,
              bairro: cliente.bairro ?? "",
              cep: cliente.cep,
              endereco: cliente.endereco,
              lat: cliente.lat,
              lng: cliente.lng,
            }
          : {}),
      }
    : // "publicar parecida": o mesmo cliente da vaga de antes, se ele ainda está na lista
      clienteDaCopia && clientes?.some((c) => c.id === clienteDaCopia)
      ? { ...inicialSemCliente, cliente_id: clienteDaCopia }
      : inicialSemCliente;
  // a vaga do pedido: o cargo, quantas pessoas e o resto na descrição (a agência confere e completa)
  const inicialComPedido: ValoresAnuncio = pedido
    ? {
        ...inicial,
        titulo: pedido.cargo,
        vagas: pedido.quantidade,
        descricao: descricaoDoPedido(pedido) || inicial.descricao,
      }
    : inicial;
  const chamada = perfil.tipo === "pessoa" && !copia && !convite && !(await meuCurriculoNaVitrine().catch(() => false));
  return (
    <PublicarAnuncio
      // no alto da coluna do formulário, embaixo do título e dos passos
      antes={
        chamada || copia || pedido ? (
          <>
            {chamada && <ChamadaCurriculo />}
            {pedido && (
              <Aviso tipo="info" titulo={`Vaga do pedido de ${pedido.cliente ?? "seu cliente"}`}>
                O cargo, a quantidade e o que o cliente contou já vieram. Confira, complete e publique: a vaga fica
                ligada ao pedido, e o cliente acompanha pelo link dele.
              </Aviso>
            )}
            {copia && (
              <Aviso tipo="info" titulo="Vaga nova a partir de outra">
                Os campos vieram de “{copia.titulo}”. Mude o que for diferente e publique: a vaga antiga continua como
                está.
              </Aviso>
            )}
          </>
        ) : null
      }
      inicial={inicialComPedido}
      pedido={pedido?.id ?? null}
      continuar={continuar}
      comecarConferindo={Boolean(copia)}
      autor={perfil.nome}
      comModelos={!copia && !convite}
      modelo={copia || convite ? null : modelo}
      ia={ia}
      agencia={agencia}
      contatoAgencia={{ whatsapp: perfil.whatsapp, email: perfil.email }}
      clientes={clientes}
      enderecoPublico={publico}
      convite={
        convite && !copia ? { token: convite.token, nome: convite.nome, pronta: Boolean(convite.rascunho) } : null
      }
    />
  );
}

/**
 * Quem procura trabalho às vezes toca em "Publicar" achando que é para o currículo:
 * aqui ele acha o caminho certo.
 */
function ChamadaCurriculo() {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-surface-200 px-3 py-3 shadow-card sm:px-4">
      <FileUser aria-hidden className="size-5 shrink-0 text-terra-text" />
      <p className="min-w-0 grow basis-56 text-body-sm">
        <span className="text-label">Procura trabalho?</span> Aqui é para publicar vaga ou serviço. Para as empresas
        acharem você, cadastre seu currículo.
      </p>
      <BotaoLink href="/perfil/curriculo?para=talentos" variante="secundario" tamanho="sm">
        <FileUser aria-hidden />
        Cadastrar currículo
      </BotaoLink>
    </div>
  );
}

function vazio(cidade: string, bairro: string): ValoresAnuncio {
  return {
    tipo: "vaga",
    titulo: "",
    descricao: "",
    categoria: "",
    regime: null,
    pagamento_valor: null,
    pagamento_unidade: null,
    beneficios: null,
    horario: null,
    vagas: 1,
    cidade,
    bairro,
    lat: null,
    lng: null,
  };
}
