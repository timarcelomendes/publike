import type { Metadata } from "next";
import { Suspense } from "react";
import { FormAnuncio } from "@/components/form-anuncio";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { ajudaDaIADisponivel } from "@/lib/dados";
import { exigirPerfilCompleto } from "@/lib/sessao";

export const metadata: Metadata = {
  title: "Publicar grátis",
  description: "Publique uma vaga ou ofereça seus serviços em Goiânia e região. De graça.",
};

export default function Publicar() {
  return (
    <Container className="max-w-3xl py-8">
      <h1 className="text-h2 sm:text-h1">Publicar grátis</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Leva dois minutos. Seu WhatsApp só aparece para quem você curtir de volta.
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
        <FormAnuncio inicial={vazio("Goiânia", "")} />
      </>
    );
  }
  const { perfil } = await exigirPerfilCompleto("/publicar");
  const ia = await ajudaDaIADisponivel();
  return <FormAnuncio inicial={vazio(perfil.cidade, perfil.bairro ?? "")} ia={ia} />;
}

function vazio(cidade: string, bairro: string) {
  return {
    tipo: "vaga" as const,
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
