import { BellRing, MapPin, Store } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { BotaoSeguir } from "@/components/social/botoes";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
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
  const lista = await meusSeguidos();

  if (lista.length === 0) {
    return (
      <Vazio icone={BellRing} titulo="Você ainda não segue ninguém" acao={<BotaoLink href="/">Ver oportunidades</BotaoLink>}>
        Siga um comércio, uma empresa ou um bairro e receba um aviso quando sair vaga ou serviço novo ali. É só tocar em
        “Avisar de vagas novas” na página do anúncio ou do perfil.
      </Vazio>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-h2">O que você segue</h2>
        <p className="mt-1 text-body text-ink-muted">
          Quando sair anúncio novo, chega um aviso (no máximo 5 por dia). Para parar, toque em “Seguindo”.
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
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
