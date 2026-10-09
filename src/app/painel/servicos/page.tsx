import { Store } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { FormServicos, type ValoresServicos } from "@/components/form-servicos";
import { Aviso, Esqueleto } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { listarMeusServicos } from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { regiaoDoBairro } from "@/lib/regioes";
import { exigirPerfilCompleto } from "@/lib/sessao";

export const metadata: Metadata = { title: "Meus serviços" };

export default function MeusServicos({ searchParams }: PageProps<"/painel/servicos">) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-h2">Mostre o que você faz</h2>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Pedreiro, diarista, manicure, eletricista… Quem precisa vê seus serviços perto de casa e chama você. Seu
        WhatsApp só aparece quando você aceitar.
      </p>
      <Suspense fallback={<Esqueleto className="h-[60rem] w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

/** Para quem ainda não tem serviço: onde atende começa pela região (ou cidade) do perfil. */
function areaDoPerfil(cidade: string, bairro: string | null) {
  const regiao = regiaoDoBairro(cidade, bairro ?? "");
  if (regiao) return [`Goiânia: ${regiao}`];
  return [cidade];
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/servicos">["searchParams"] }) {
  const sp = await searchParams;
  if (MODO_DEMO) {
    const vazio: ValoresServicos = {
      servicos: [],
      cidade: "Goiânia",
      bairro: "",
      lat: null,
      lng: null,
      atende: ["Goiânia: Centro"],
      horario: null,
    };
    return (
      <>
        <Aviso tipo="alerta" className="mb-6" titulo="Modo demonstração">
          {MENSAGEM_DEMO}
        </Aviso>
        <FormServicos inicial={vazio} usuarioId="00000000-0000-0000-0000-000000000000" demo />
      </>
    );
  }

  const { usuario, perfil } = await exigirPerfilCompleto("/painel/servicos");
  const servicos = await listarMeusServicos();
  // o que é igual para todos (onde fica, onde atende, quando) vem do primeiro serviço
  const base = servicos.find((s) => s.status !== "em_analise" && s.status !== "removido") ?? servicos[0];
  const inicial: ValoresServicos = {
    servicos: servicos.map((s) => ({
      id: s.id,
      oficio: s.oficio,
      categoria: s.categoria,
      titulo: s.titulo,
      descricao: s.descricao,
      pagamento_valor: s.pagamento_valor,
      pagamento_unidade: s.pagamento_unidade,
      fotos: s.fotos,
      status: s.status,
    })),
    cidade: base?.cidade ?? perfil.cidade,
    bairro: base?.bairro ?? perfil.bairro ?? "",
    lat: base?.lat ?? null,
    lng: base?.lng ?? null,
    atende: base?.atende.length ? base.atende : areaDoPerfil(perfil.cidade, perfil.bairro),
    horario: base?.horario ?? null,
  };

  return (
    <>
      {primeiro(sp.salvo) === "1" && (
        <Aviso tipo="sucesso" className="mb-6" titulo="Seus serviços estão no ar!">
          <p>
            Eles ficam 90 dias na busca. Quando alguém quiser contratar você, chega um aviso e a pessoa aparece no
            painel.
          </p>
          <p className="mt-3">
            <BotaoLink href={`/perfil/${usuario.id}`} tamanho="sm">
              <Store aria-hidden />
              Ver minha vitrine
            </BotaoLink>
          </p>
        </Aviso>
      )}
      <FormServicos inicial={inicial} usuarioId={usuario.id} />
    </>
  );
}
