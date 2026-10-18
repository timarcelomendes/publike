import type { Metadata } from "next";
import { Suspense } from "react";
import { FormAnuncio, type ValoresAnuncio } from "@/components/form-anuncio";
import { PublicarAnuncio } from "@/components/publicar-anuncio";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { ajudaDaIADisponivel, obterAnuncio, obterMeuUltimoEndereco, obterUsuario } from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { exigirPerfilCompleto } from "@/lib/sessao";
import { UUID } from "@/lib/validacao";
import { valoresDoAnuncio } from "@/lib/valores-anuncio";
import { rascunhoValido } from "@/lib/convites";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { valoresDoConvite } from "@/lib/valores-convite";
import { obterTriagem } from "@/lib/servidor/triagem";

export const metadata: Metadata = {
  title: "Publicar grátis",
  description: "Publique uma vaga em Goiânia e região e ache profissionais que moram perto. De graça para empresas de qualquer tamanho.",
};

export default function Publicar({ searchParams }: PageProps<"/publicar">) {
  return (
    <Container className="max-w-3xl py-8">
      <h1 className="text-h2 sm:text-h1">Publicar grátis</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Leva dois minutos e é grátis para empresas de qualquer tamanho. Com o endereço certo, quem mora perto vê sua vaga
        primeiro. Seu WhatsApp só aparece para quem você curtir de volta.
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
        <FormAnuncio inicial={vazio("Goiânia", "")} enderecoPublico />
      </>
    );
  }
  const sp = await searchParams;
  const pedida = primeiro(sp.copiar);
  const pedidaCopia = pedida && UUID.test(pedida) ? pedida : null;
  const continuar = primeiro(sp.continuar) === "1";
  // veio do link do convite do Publike: a vaga lida do anúncio da empresa vem pronta
  const convite = await conviteDoLink(primeiro(sp.convite));
  // sem conta dá para preencher a vaga: o rascunho fica no aparelho e sai depois de entrar
  if (!pedidaCopia && !(await obterUsuario())) {
    const base = vazio("Goiânia", "");
    return (
      <PublicarAnuncio
        inicial={convite?.rascunho ? valoresDoConvite(convite.rascunho, base) : base}
        semConta
        comModelos={!convite}
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
        : "/publicar";
  const { perfil } = await exigirPerfilCompleto(voltar);
  const publico = perfil.tipo !== "pessoa";
  const [ia, ultimo, original] = await Promise.all([
    ajudaDaIADisponivel(),
    publico ? obterMeuUltimoEndereco() : null,
    pedidaCopia ? obterAnuncio(pedidaCopia) : null,
  ]);
  // "Publicar parecida": só de uma vaga sua (serviço se edita em "Meus serviços")
  const copia =
    original &&
    original.autor_id === perfil.id &&
    original.tipo === "vaga" &&
    !["em_analise", "removido"].includes(original.status)
      ? original
      : null;
  const triagem = copia ? await obterTriagem(copia.id) : {};
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
  const inicial =
    convite?.rascunho && !copia ? valoresDoConvite(convite.rascunho, inicialSemConvite) : inicialSemConvite;
  return (
    <>
      {copia && (
        <Aviso tipo="info" className="mb-6" titulo="Vaga nova a partir de outra">
          Os campos vieram de “{copia.titulo}”. Mude o que for diferente e publique: a vaga antiga continua como está.
        </Aviso>
      )}
      <PublicarAnuncio
        inicial={inicial}
        continuar={continuar}
        comModelos={!copia && !convite}
        ia={ia}
        agencia={perfil.tipo === "agencia"}
        contatoAgencia={{ whatsapp: perfil.whatsapp, email: perfil.email }}
        enderecoPublico={publico}
        convite={
          convite && !copia ? { token: convite.token, nome: convite.nome, pronta: Boolean(convite.rascunho) } : null
        }
      />
    </>
  );
}

/** O convite do link (só se ainda vale: quem disse que não quer não vê mais o convite). */
async function conviteDoLink(token: string | undefined) {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data } = await criarClientePublico().rpc("convite_do_token", { p_token: token });
  const c = data?.[0];
  if (!c || c.status === "recusou") return null;
  return { token, nome: c.nome, rascunho: rascunhoValido(c.rascunho) };
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
