import { FileUser } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FormAnuncio, type ValoresAnuncio } from "@/components/form-anuncio";
import { PublicarAnuncio } from "@/components/publicar-anuncio";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
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
import { valoresDoConvite } from "@/lib/valores-convite";
import { obterTriagem } from "@/lib/servidor/triagem";
import { clienteDaVaga, clientesParaVaga } from "@/lib/servidor/clientes";
import { temLugar } from "@/lib/clientes";
import { obterIntencao } from "@/lib/servidor/intencao";
import { ONDE_FUNCIONA, PRACA_PADRAO } from "@/lib/pracas";
import { cidadeDaVisita } from "@/lib/servidor/cidade";

export const metadata: Metadata = {
  title: "Publicar grátis",
  description: `Publique uma vaga em ${ONDE_FUNCIONA} e ache profissionais que moram perto. De graça para empresas de qualquer tamanho.`,
};

export default function Publicar({ searchParams }: PageProps<"/publicar">) {
  return (
    <Container className="max-w-5xl py-8">
      <h1 className="text-h2 sm:text-h1">Publicar grátis</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Leva dois minutos e é grátis, sem plano e sem limite de candidatos, para a sua casa ou o seu negócio. Com o
        endereço certo, quem mora perto vê primeiro. Seu WhatsApp só aparece para quem você curtir de volta.
      </p>
      <Suspense fallback={<Esqueleto className="h-[60rem] w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/publicar">["searchParams"] }) {
  if (MODO_DEMO) {
    return (
      <>
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
    const intencao = await obterIntencao().catch(() => null);
    const contrata = intencao === "contratar_pessoa" || intencao === "contratar_servico";
    return (
      <>
        {!convite && !contrata && <ChamadaCurriculo />}
        <PublicarAnuncio
          inicial={convite?.rascunho ? valoresDoConvite(convite.rascunho, base) : base}
          semConta
          comModelos={!convite}
          modelo={convite ? null : modelo}
          // ainda não se sabe se a conta é de empresa: o endereço aparece como opcional
          enderecoPublico="talvez"
          convite={convite && { token: convite.token, nome: convite.nome, pronta: Boolean(convite.rascunho) }}
        />
      </>
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
  const [ia, ultimo, original, clientes] = await Promise.all([
    ajudaDaIADisponivel(),
    publico ? obterMeuUltimoEndereco() : null,
    pedidaCopia ? obterAnuncio(pedidaCopia) : null,
    agencia ? clientesParaVaga(clientePedido) : null,
  ]);
  // "Publicar parecida": só de uma vaga sua (serviço se edita em "Meus serviços")
  const copia =
    original &&
    original.autor_id === perfil.id &&
    original.tipo === "vaga" &&
    !["em_analise", "removido"].includes(original.status)
      ? original
      : null;
  const [triagem, clienteDaCopia] = await Promise.all([
    copia ? obterTriagem(copia.id) : {},
    copia && clientes ? clienteDaVaga(copia.id) : null,
  ]);
  // a vaga é para este cliente: o nome, o jeito (confidencial ou não) e o lugar vêm dele
  const cliente = clientePedido ? (clientes?.find((c) => c.id === clientePedido) ?? null) : null;
  // comércio e empresa: a próxima vaga já vem com o endereço da última
  const inicialSemConvite = copia
    ? valoresDoAnuncio(copia, { copiar: true, triagem })
    : ultimo
      ? {
          ...vazio(ultimo.cidade, ultimo.bairro),
          cep: ultimo.cep,
          endereco: ultimo.endereco,
          lat: ultimo.lat,
          lng: ultimo.lng,
        }
      : vazio(perfil.cidade, perfil.bairro ?? "");
  const inicialSemCliente =
    convite?.rascunho && !copia ? valoresDoConvite(convite.rascunho, inicialSemConvite) : inicialSemConvite;
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
  return (
    <>
      {perfil.tipo === "pessoa" && !copia && !convite && !(await meuCurriculoNaVitrine().catch(() => false)) && (
        <ChamadaCurriculo />
      )}
      {copia && (
        <Aviso tipo="info" className="mb-6" titulo="Vaga nova a partir de outra">
          Os campos vieram de “{copia.titulo}”. Mude o que for diferente e publique: a vaga antiga continua como está.
        </Aviso>
      )}
      <PublicarAnuncio
        inicial={inicial}
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
    </>
  );
}

/**
 * Quem procura trabalho às vezes toca em "Publicar" achando que é para o currículo:
 * aqui ele acha o caminho certo.
 */
function ChamadaCurriculo() {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-surface-200 px-3 py-3 shadow-card sm:px-4">
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
