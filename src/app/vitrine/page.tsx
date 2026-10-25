import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Aviso, Container, Esqueleto } from "@/components/ui/basicos";
import { VitrineComRascunho } from "@/components/vitrine-com-rascunho";
import type { ValoresServicos } from "@/components/form-servicos";
import { areaDaRegiao, REGIOES_DAS_CIDADES, type Cidade } from "@/lib/constantes";
import { obterUsuario } from "@/lib/dados";
import { cidadeDaVisita } from "@/lib/servidor/cidade";

// A vitrine de quem ainda não entrou: preenche os serviços aqui, e o "Entrar e publicar" guarda
// no aparelho e leva ao /entrar; depois de entrar, /painel/servicos volta com tudo preenchido.
// Quem já entrou vai direto para /painel/servicos.

export const metadata: Metadata = {
  title: "Monte sua vitrine grátis",
  description: "Pedreiro, diarista, manicure, eletricista: mostre seus serviços para quem mora perto. É grátis.",
  robots: { index: false },
};

export default function PaginaVitrine() {
  return (
    <Container className="max-w-3xl py-8">
      <h1 className="text-h2 sm:text-h1">Mostre o que você faz</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Pedreiro, diarista, manicure, eletricista… Quem precisa vê seus serviços perto de casa e chama você. Seu
        WhatsApp aparece no match: na hora, com o contato direto, ou quando você aceitar.
      </p>
      <Suspense fallback={<Esqueleto className="h-[60rem] w-full rounded-lg" />}>
        <Conteudo />
      </Suspense>
    </Container>
  );
}

async function Conteudo() {
  if (await obterUsuario()) redirect("/painel/servicos");
  const { praca } = await cidadeDaVisita();
  const cidade = praca.cidade;
  const regioes = REGIOES_DAS_CIDADES[cidade as Cidade];
  const inicial: ValoresServicos = {
    servicos: [],
    cidade,
    bairro: "",
    lat: null,
    lng: null,
    atende: [regioes?.length ? areaDaRegiao(cidade, "Centro") : cidade],
    horario: null,
    contato_direto: true,
  };
  return (
    <>
      <Aviso tipo="info" className="mb-6" titulo="Preencha agora, entre só para publicar">
        O que você preencher fica guardado neste aparelho. No fim, toque em “Entrar e publicar”: depois de entrar, a
        vitrine volta preenchida para você conferir, pôr fotos e salvar.
      </Aviso>
      <VitrineComRascunho inicial={inicial} usuarioId="" semConta />
    </>
  );
}
