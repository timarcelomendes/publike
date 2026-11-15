import { Store } from "lucide-react";
import Link from "next/link";
import { obterMeuCurriculo, obterMeuPerfil } from "@/lib/dados";
import { distanciaCurta, funcoesDoCurriculo } from "@/lib/rota-curriculo";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * "Abriu perto de você" no alto do feed (claude/plano-base-de-empresas-da-receita.md, parte 1; migração 20270606120000):
 * para quem procura, com o CEP de casa e funções no currículo, até 3 comércios que abriram nos últimos 30 dias a até
 * 3 km, nos ramos que contratam essas funções. Nunca diz que há vaga: lugar novo costuma contratar.
 */
export async function AbriuPertoNoFeed() {
  const [perfil, curriculo] = await Promise.all([obterMeuPerfil(), obterMeuCurriculo()]);
  if (!perfil || perfil.tipo !== "pessoa" || !curriculo) return null;
  const funcoes = funcoesDoCurriculo(curriculo);
  if (!funcoes.length) return null;
  const banco = await criarClienteServidor();
  const { data, error } = await banco.rpc("abriu_perto_de_mim", { p_cbos: funcoes.map((f) => f.cbo), p_dias: 30, p_limite: 3 });
  if (error || !data?.length) return null;
  const titulo = funcoes.find((f) => f.cbo === data[0].cbo)?.titulo ?? funcoes[0].titulo;
  return (
    <section
      aria-label="Abriu perto de você"
      className="mb-3 flex flex-col gap-2 rounded-lg border border-line bg-surface-200 px-4 py-3 text-body-sm text-ink"
    >
      <p className="flex items-center gap-2 text-label">
        <Store aria-hidden className="size-4 text-terra-text" />
        Abriu perto de você
      </p>
      <ul className="flex flex-col gap-1">
        {data.map((l) => (
          <li key={l.cnpj}>
            <strong className="font-semibold">{l.nome}</strong>
            {l.ramo && <span className="text-ink-muted">, {l.ramo.toLowerCase()}</span>}
            <span className="text-ink-muted">
              , {[l.bairro, `a ${distanciaCurta(l.distancia_m)} de casa`].filter(Boolean).join(", ")}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-ink-muted">Lugar novo costuma contratar. Leve o seu currículo.</p>
      <Link
        href={`/rota-do-curriculo?cbo=${data[0].cbo}`}
        className="self-start text-label text-ink underline underline-offset-4 hover:no-underline"
      >
        Montar a rota do currículo de {titulo.toLowerCase()}
      </Link>
    </section>
  );
}
