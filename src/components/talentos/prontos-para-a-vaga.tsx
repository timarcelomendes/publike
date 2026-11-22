import { BadgeCheck, MapPin } from "lucide-react";
import Link from "next/link";
import { MODO_DEMO } from "@/lib/config";
import { talentosParaVaga } from "@/lib/dados";
import { plural } from "@/lib/formato";
import { distanciaCurta } from "@/lib/rota-curriculo";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { BotaoConvidar } from "../painel/botao-convidar";
import { Avatar } from "../ui/basicos";

// Prontos para assumir, no alto do "Para a sua vaga" (migração 20270827120000; 21/11/2026, Marcelo: "a empresa que
// não tem assinatura pode ter 5 talentos qualificados", "5 por vaga no ar"). Quem a leitura do currículo indicou como
// pronto para a função da vaga, dos que moram mais perto da vaga para os mais longe: 5 sem assinatura, todos (até 50)
// com. Sem o contato e com o nome encurtado; a nota da leitura não aparece. Sem a função da vaga ou ninguém pronto
// ainda, nada aparece.

type Pronto = {
  perfil_id: string;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  titulo: string | null;
  funcao: string;
  porque: string;
  distancia_m: number | null;
};
type Resposta = { plano: boolean; funcao: boolean; total: number; prontos: Pronto[] };

export async function ProntosParaAVaga({ vaga }: { vaga: { id: string; titulo: string } }) {
  if (MODO_DEMO) return null;
  const c = await criarClienteServidor();
  const [{ data, error }, lista] = await Promise.all([
    c.rpc("prontos_para_a_vaga", { p_anuncio: vaga.id }),
    talentosParaVaga(vaga.id).catch(() => null),
  ]);
  if (error || !data) return null;
  const r = data as unknown as Resposta;
  if (!r.funcao || !r.prontos.length) return null;
  const convidados = new Set((lista ?? []).filter((t) => t.convidado).map((t) => t.perfil_id));
  const faltam = r.total - r.prontos.length;
  return (
    <section
      aria-labelledby="prontos-titulo"
      className="flex flex-col gap-3 rounded-lg border-2 border-cerrado bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="prontos-titulo" className="flex items-center gap-2 font-display text-h3">
          <BadgeCheck aria-hidden className="size-5 text-cerrado-text" />
          {plural(r.total, "pessoa pronta", "pessoas prontas")} para assumir “{vaga.titulo}”
        </h2>
        <p className="text-body-sm text-ink-muted">
          A leitura do currículo indicou quem já fez esse trabalho, dos que moram mais perto da vaga para os mais longe.
          Convide quem combinar: o contato aparece quando a pessoa aceitar.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {r.prontos.map((p) => (
          <li key={p.perfil_id} className="flex flex-wrap items-start gap-3 rounded-md bg-surface-100 p-3">
            <Avatar nome={p.nome} tamanho={36} />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-label">{p.nome}</span>
              <span className="text-body-sm">
                {p.funcao} · pronto para assumir
              </span>
              {p.porque && <span className="text-body-sm text-ink-muted">{p.porque}</span>}
              {(p.bairro || p.cidade) && (
                <span className="flex items-center gap-1 text-caption text-ink-muted">
                  <MapPin aria-hidden className="size-3.5" />
                  {[p.bairro, p.cidade].filter(Boolean).join(", ")}
                  {p.distancia_m != null && ` · ≈ ${distanciaCurta(p.distancia_m)} da vaga`}
                </span>
              )}
            </div>
            <BotaoConvidar anuncioId={vaga.id} perfilId={p.perfil_id} convidado={convidados.has(p.perfil_id)} />
          </li>
        ))}
      </ul>
      {!r.plano && faltam > 0 && (
        <p className="text-body-sm">
          {faltam === 1 ? "Mais 1 pessoa pronta" : `Mais ${faltam} pessoas prontas`} para esta vaga com a assinatura.{" "}
          <Link href="/painel/planos" className="text-label underline underline-offset-2">
            Ver os planos
          </Link>
        </p>
      )}
    </section>
  );
}
