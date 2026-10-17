import { BellRing, MapPin, SearchCheck, Store } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { PararBusca } from "@/components/explorar/avisar-busca";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { BotaoSeguir } from "@/components/social/botoes";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { minhasBuscasSalvas } from "@/lib/dados";
import { meusSeguidos } from "@/lib/dados-social";
import { exigirUsuario } from "@/lib/sessao";

export default function Seguindo() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/seguindo");
  const [lista, buscas] = await Promise.all([meusSeguidos(), minhasBuscasSalvas()]);

  if (lista.length === 0 && buscas.length === 0) {
    return (
      <Vazio
        icone={BellRing}
        titulo="Você ainda não segue ninguém"
        acao={<BotaoLink href="/">Ver oportunidades</BotaoLink>}
      >
        Siga um comércio, uma empresa ou um bairro e receba um aviso quando sair vaga ou serviço novo ali. É só tocar em
        “Seguir” na página do anúncio ou do perfil. Na busca de vagas, toque em “Me avise de vagas assim” para receber
        as vagas novas daquela busca.
      </Vazio>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {buscas.length > 0 && (
        <section aria-labelledby="buscas" className="flex flex-col gap-4">
          <div>
            <h2 id="buscas" className="text-h2">
              Buscas que avisam você
            </h2>
            <p className="mt-1 text-body text-ink-muted">
              Quando entra no ar uma vaga nova que bate com a busca, chega um aviso (no máximo 5 por dia).
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {buscas.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <SearchCheck aria-hidden className="size-5 shrink-0 text-terra-text" />
                <span className="min-w-0 flex-1">
                  <Link href={b.caminho} className="text-label hover:underline">
                    Vagas {b.rotulo}
                  </Link>
                  <span className="block text-body-sm text-ink-muted">Vagas novas desta busca</span>
                </span>
                <PararBusca id={b.id} />
              </li>
            ))}
          </ul>
        </section>
      )}
      {lista.length > 0 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-h2">O que você segue</h2>
            <p className="mt-1 text-body text-ink-muted">
              Quando sair anúncio novo, chega um aviso (no máximo 5 por dia). Para parar, toque em “Deixar de seguir”.
            </p>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {lista.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                {s.alvo_perfil ? (
                  <Store aria-hidden className="size-5 shrink-0 text-terra-text" />
                ) : (
                  <MapPin aria-hidden className="size-5 shrink-0 text-terra-text" />
                )}
                <span className="min-w-0 flex-1">
                  {s.alvo_perfil ? (
                    <Link href={`/perfil/${s.alvo_perfil}`} className="text-label hover:underline">
                      {s.alvo_nome ?? "Perfil"}
                    </Link>
                  ) : (
                    <span className="text-label">
                      {s.bairro}, {s.cidade}
                    </span>
                  )}
                  <span className="block text-body-sm text-ink-muted">
                    {s.alvo_perfil ? "Anúncios novos deste perfil" : "Anúncios novos neste bairro"}
                  </span>
                </span>
                <BotaoSeguir
                  alvo={s.alvo_perfil ? { perfil: s.alvo_perfil } : { cidade: s.cidade ?? "", bairro: s.bairro ?? "" }}
                  seguidoId={s.id}
                  logado
                  voltar="/painel/seguindo"
                  rotulo="Seguir de novo"
                  lista
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
