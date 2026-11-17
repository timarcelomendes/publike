import { Store } from "lucide-react";
import Link from "next/link";
import { obterMeuCurriculo, obterMeuPerfil } from "@/lib/dados";
import { distanciaCurta } from "@/lib/rota-curriculo";
import { funcoesParaARota, pontoDaPessoa } from "@/lib/servidor/funcoes-da-rota";
import { NOTA_DO_RAMO, ramoNaCidade } from "@/lib/servidor/ramo-na-cidade";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { QueroTrabalharAqui } from "./quero-trabalhar-aqui";
import { bairroDaReceita } from "@/lib/cnpj";

/**
 * "Abriu perto de você" no alto do feed (claude/plano-base-de-empresas-da-receita.md, parte 1; migração 20270606120000):
 * para quem procura, com funções no currículo e o CEP de casa (ou o bairro), até 3 comércios que abriram nos últimos 30 dias a até
 * 3 km, nos ramos que contratam essas funções. Nunca diz que há vaga: lugar novo costuma contratar.
 */
export async function AbriuPertoNoFeed() {
  const [perfil, curriculo] = await Promise.all([obterMeuPerfil(), obterMeuCurriculo()]);
  if (!perfil || perfil.tipo !== "pessoa" || !curriculo) return null;
  const [funcoes, onde] = await Promise.all([funcoesParaARota(curriculo), pontoDaPessoa(perfil)]);
  if (!funcoes.length || !onde) return null;
  const banco = await criarClienteServidor();
  const { data, error } = await banco.rpc("abriu_perto_do_ponto", {
    p_lat: onde.ponto.lat,
    p_lng: onde.ponto.lng,
    p_cbos: funcoes.map((f) => f.cbo),
    p_dias: 30,
    p_limite: 3,
  });
  if (error || !data?.length) return null;
  // os lugares em que a pessoa já disse "quero trabalhar aqui" (abrem com o Desistir)
  // e quantas pessoas o ramo de cada um contratou na cidade (Novo Caged; do ramo, não da empresa)
  const [queroLista, noRamo] = await Promise.all([
    banco.rpc("meus_interesses", { p_cnpjs: data.map((l) => l.cnpj) }).then((r) => r.data ?? []),
    ramoNaCidade(data.map((l) => l.cnpj)),
  ]);
  const quero = new Set<string>(queroLista);
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
      <ul className="flex flex-col gap-2">
        {data.map((l) => (
          <li key={l.cnpj} className="flex flex-col gap-1.5 border-t border-line pt-2 first:border-t-0 first:pt-0">
            <span>
            <strong className="font-semibold">{l.nome}</strong>
            {l.ramo && <span className="text-ink-muted">, {l.ramo.toLowerCase()}</span>}
            <span className="text-ink-muted">
              , {[l.bairro && bairroDaReceita(l.bairro), `a ${distanciaCurta(l.distancia_m)} ${onde.deCasa ? "de casa" : "do seu bairro"}`].filter(Boolean).join(", ")}
            </span>
            </span>
            {noRamo.get(l.cnpj) && <span className="text-ink-muted">{noRamo.get(l.cnpj)}.</span>}
            <QueroTrabalharAqui
              cnpj={l.cnpj}
              nome={l.nome}
              funcao={funcoes.find((f) => f.cbo === l.cbo)?.titulo}
              jaQuer={quero.has(l.cnpj)}
            />
          </li>
        ))}
      </ul>
      <p className="text-ink-muted">
        Lugar novo costuma contratar. Diga que quer trabalhar lá.{noRamo.size > 0 && <> {NOTA_DO_RAMO}</>}
      </p>
      <Link
        href={`/quem-contrata-perto?cbo=${data[0].cbo}`}
        className="self-start text-label text-ink underline underline-offset-4 hover:no-underline"
      >
        Ver quem contrata {titulo.toLowerCase()} perto de você
      </Link>
    </section>
  );
}
