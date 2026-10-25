import { ChevronRight, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AvisoConvite } from "@/components/aviso-convite";
import { FormServicos, type ValoresServicos } from "@/components/form-servicos";
import { Aviso, Esqueleto } from "@/components/ui/basicos";
import { VitrineComRascunho } from "@/components/vitrine-com-rascunho";
import { BotaoLink } from "@/components/ui/botao";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { areaDaRegiao, UNIDADES_SERVICO } from "@/lib/constantes";
import { NotaDoProfissional } from "@/components/avaliacoes";
import { listarMeusServicos, obterNotaDoProfissional } from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { regiaoDoBairro } from "@/lib/regioes";
import { centroDoBairro } from "@/lib/servidor/cep";
import { contatoDiretoDosServicos } from "@/lib/servidor/contato-direto";
import { conviteDoLink } from "@/lib/servidor/convite-do-link";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirPerfilCompleto } from "@/lib/sessao";
import { PRACA_PADRAO } from "@/lib/pracas";

export const metadata: Metadata = { title: "Meus serviços" };

export default function MeusServicos({ searchParams }: PageProps<"/painel/servicos">) {
  return (
    <div className="max-w-3xl">
      <h2 className="text-h2">Mostre o que você faz</h2>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        Pedreiro, diarista, manicure, eletricista… Quem precisa vê seus serviços perto de casa e chama você. Seu
        WhatsApp aparece no match: na hora, com o contato direto, ou quando você aceitar.
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
  if (regiao) return [areaDaRegiao(cidade, regiao)];
  return [cidade];
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/servicos">["searchParams"] }) {
  const sp = await searchParams;
  if (MODO_DEMO) {
    const vazio: ValoresServicos = {
      servicos: [],
      cidade: PRACA_PADRAO.cidade,
      bairro: "",
      lat: null,
      lng: null,
      atende: [areaDaRegiao(PRACA_PADRAO.cidade, "Centro")],
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

  // veio do link do convite do Publike: o serviço lido do anúncio vem pronto, e salvar é o aceite
  const convite = await conviteDoLink(primeiro(sp.convite));
  const { usuario, perfil } = await exigirPerfilCompleto(
    convite ? `/painel/servicos?convite=${convite.token}` : "/painel/servicos",
  );
  const [servicos, nota, direto] = await Promise.all([
    listarMeusServicos(),
    obterNotaDoProfissional(usuario.id),
    criarClienteServidor().then((c) => contatoDiretoDosServicos(c, usuario.id)),
  ]);
  const r = convite?.tipo === "prestador" ? convite.rascunho : null;
  // sem vitrine ainda: o ponto no mapa começa no meio do bairro do anúncio (dá para ajustar)
  const centro =
    r?.bairro && servicos.length === 0
      ? await centroDoBairro(r.bairro, r.cidade || PRACA_PADRAO.cidade).catch(() => null)
      : null;
  const doConvite =
    r && r.titulo && !servicos.some((s) => s.titulo.toLowerCase() === r.titulo.toLowerCase())
      ? {
          id: "",
          oficio: r.oficio || null,
          categoria: r.categoria,
          titulo: r.titulo,
          descricao: r.descricao,
          pagamento_valor: (UNIDADES_SERVICO as readonly string[]).includes(r.unidade) ? r.salario : null,
          pagamento_unidade: (UNIDADES_SERVICO as readonly string[]).includes(r.unidade) ? r.unidade : null,
          fotos: [],
          status: "novo",
        }
      : null;
  // o que é igual para todos (onde fica, onde atende, quando) vem do primeiro serviço
  const base = servicos.find((s) => s.status !== "em_analise" && s.status !== "removido") ?? servicos[0];
  const inicial: ValoresServicos = {
    servicos: [
      ...servicos.map((s) => ({
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
      ...(doConvite ? [doConvite] : []),
    ],
    cidade: base?.cidade ?? (r?.bairro ? r.cidade || PRACA_PADRAO.cidade : perfil.cidade),
    bairro: base?.bairro ?? (r?.bairro || perfil.bairro || ""),
    lat: base?.lat ?? centro?.lat ?? null,
    lng: base?.lng ?? centro?.lng ?? null,
    atende: base?.atende.length
      ? base.atende
      : r?.bairro
        ? areaDoPerfil(r.cidade || PRACA_PADRAO.cidade, r.bairro)
        : areaDoPerfil(perfil.cidade, perfil.bairro),
    horario: base?.horario ?? null,
    contato_direto: direto ?? true,
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
      {servicos.length > 0 && (
        <Link
          href="/painel/avaliacoes"
          className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-200 p-4 transition-colors hover:bg-surface-300"
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-label">Avaliações recebidas</span>
            {nota.total > 0 ? (
              <NotaDoProfissional media={nota.media} total={nota.total} />
            ) : (
              <span className="text-body-sm text-ink-muted">Ainda nenhuma. Quem contratar você pode avaliar.</span>
            )}
          </span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </Link>
      )}
      {convite?.tipo === "prestador" && (
        <div className="mb-6">
          <AvisoConvite token={convite.token} nome={convite.nome}>
            {doConvite
              ? "O serviço já veio preenchido com o seu anúncio. Confira, coloque fotos se quiser e toque em Salvar."
              : "Escreva o seu serviço e toque em Salvar."}{" "}
            É grátis, sem plano e sem taxa.
          </AvisoConvite>
        </div>
      )}
      <VitrineComRascunho
        inicial={inicial}
        usuarioId={usuario.id}
        rascunho={primeiro(sp.rascunho) === "1"}
        extras={
          convite?.tipo === "prestador" ? <input type="hidden" name="convite" value={convite.token} /> : undefined
        }
      />
    </>
  );
}
