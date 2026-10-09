import type { Metadata } from "next";
import { Suspense } from "react";
import { FormAnuncio, type ValoresAnuncio } from "@/components/form-anuncio";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { ajudaDaIADisponivel, obterMeuUltimoEndereco } from "@/lib/dados";
import { exigirPerfilCompleto } from "@/lib/sessao";

export const metadata: Metadata = {
  title: "Publicar grátis",
  description: "Publique uma vaga em Goiânia e região e ache profissionais que moram perto. De graça para empresas de qualquer tamanho.",
};

export default function Publicar() {
  return (
    <Container className="max-w-3xl py-8">
      <h1 className="text-h2 sm:text-h1">Publicar grátis</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Leva dois minutos e é grátis para empresas de qualquer tamanho. Com o endereço certo, quem mora perto vê sua vaga
        primeiro. Seu WhatsApp só aparece para quem você curtir de volta.
      </p>
      <Suspense fallback={<Esqueleto className="h-[60rem] w-full rounded-lg" />}>
        <Conteudo />
      </Suspense>
    </Container>
  );
}

async function Conteudo() {
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
  const { perfil } = await exigirPerfilCompleto("/publicar");
  const publico = perfil.tipo !== "pessoa";
  const [ia, ultimo] = await Promise.all([ajudaDaIADisponivel(), publico ? obterMeuUltimoEndereco() : null]);
  // comércio e empresa: a próxima vaga já vem com o endereço da última
  const inicial = ultimo
    ? { ...vazio(ultimo.cidade, ultimo.bairro), cep: ultimo.cep, endereco: ultimo.endereco, lat: ultimo.lat, lng: ultimo.lng }
    : vazio(perfil.cidade, perfil.bairro ?? "");
  return <FormAnuncio inicial={inicial} ia={ia} agencia={perfil.tipo === "agencia"} enderecoPublico={publico} />;
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
