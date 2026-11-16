import { MapPinned } from "lucide-react";
import { cacheLife } from "next/cache";
import Link from "next/link";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuCurriculo, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { formatarNumero } from "@/lib/formato";
import { funcaoPeloTitulo, tituloDaFuncao } from "@/lib/funcao-cbo";
import { origemDaRota } from "@/lib/servidor/funcoes-da-rota";
import { criarClientePublico } from "@/lib/supabase/servidor";

// A chamada de "Quem contrata perto" no alto da home (16/11/2026, Marcelo: "deveríamos ter uma opção de chegar logo
// pela home, que desperte curiosidade"): quantos lugares perto da pessoa costumam contratar algumas funções (a do
// currículo primeiro), e cada número leva direto ao mapa daquela função.

/** As funções da chamada para quem não tem currículo: as que mais aparecem no comércio. */
const FUNCOES_DA_CHAMADA = ["521110", "513505", "421125"];
const RAIO_KM = 2;

/**
 * Quantos lugares a até 2 km contratam cada função, guardado por uma hora (o ponto vem arredondado, ~1 km). A falha
 * sai como erro, e não como lista vazia, para não ficar guardada: a próxima visita tenta de novo.
 */
async function contar(lat: number, lng: number, cbos: string[]) {
  "use cache";
  cacheLife("hours");
  if (MODO_DEMO) return [];
  const { data, error } = await criarClientePublico().rpc("quantos_contratam", {
    p_lat: lat,
    p_lng: lng,
    p_raio_km: RAIO_KM,
    p_cbos: cbos,
  });
  if (error) throw new Error(`${error.code ?? "erro"}: ${error.message}`);
  return data ?? [];
}

async function contarSemQuebrar(lat: number, lng: number, cbos: string[]) {
  try {
    return await contar(lat, lng, cbos);
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    if (!mensagem.startsWith("PGRST202")) console.error("Publike: falha ao contar quem contrata perto:", mensagem);
    return [];
  }
}

export async function ChamadaQuemContrata({ className = "" }: { className?: string }) {
  const usuario = await obterUsuario().catch(() => null);
  const [perfil, curriculo] = usuario
    ? await Promise.all([obterMeuPerfil().catch(() => null), obterMeuCurriculo().catch(() => null)])
    : [null, null];
  // empresa, comércio e agência: a chamada é para quem procura trabalho
  if (perfil && perfil.tipo !== "pessoa") return null;
  const origem = await origemDaRota(perfil);
  const sua = funcaoPeloTitulo(curriculo?.titulo)?.cbo;
  // conta três e mostra duas (16/11/2026, Marcelo: "deixa 2 + outra opção, na mesma linha"): se uma não tiver lugar
  // perto, a de reserva entra no lugar dela
  const cbos = [...new Set([sua, ...FUNCOES_DA_CHAMADA].filter((c): c is string => Boolean(c)))].slice(0, 3);
  const contagens = (
    await contarSemQuebrar(Math.round(origem.ponto.lat * 100) / 100, Math.round(origem.ponto.lng * 100) / 100, cbos)
  )
    .filter((c) => c.total > 0)
    .slice(0, 2);
  if (!contagens.length) return null;
  const de = {
    casa: "de casa",
    aqui: "de você",
    bairro: "do seu bairro",
    cidade: `do centro de ${origem.cidade}`,
  }[origem.tipo];

  return (
    <section
      aria-labelledby="chamada-quem-contrata"
      className={`flex flex-col gap-2.5 rounded-lg border border-line bg-surface-100 p-3 sm:p-4 ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <MapPinned aria-hidden className="mt-0.5 size-5 shrink-0 text-terra-text" />
        <div className="flex min-w-0 flex-col">
          <h2 id="chamada-quem-contrata" className="text-label text-ink sm:text-[17px] sm:leading-6">
            Quem contrata perto de você?
          </h2>
          <p className="text-body-sm text-ink-muted">
            Lugares a até {RAIO_KM} km {de} que costumam contratar. Toque e veja no mapa.
          </p>
        </div>
      </div>
      {/* as duas funções e "Outra função" numa linha só (no celular estreito, ela corre para o lado) */}
      <ul className="sem-barra -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        {contagens.map((c) => {
          const titulo = tituloDaFuncao(c.cbo) ?? c.cbo;
          return (
            <li key={c.cbo} className="shrink-0">
              <Link
                href={`/quem-contrata-perto?${new URLSearchParams({ cbo: c.cbo, nome: titulo })}`}
                className="inline-flex min-h-10 items-center gap-2 rounded-pill border border-line-strong bg-surface-200 px-3.5 text-label text-ink transition-colors hover:border-ink"
              >
                {titulo}
                <span className="tabular-nums text-terra-text">{formatarNumero(c.total)}</span>
              </Link>
            </li>
          );
        })}
        <li className="shrink-0">
          <Link
            href="/quem-contrata-perto"
            className="inline-flex min-h-10 items-center rounded-pill border border-dashed border-line-strong px-3.5 text-label text-ink-muted transition-colors hover:border-ink hover:text-ink"
          >
            Outra função
          </Link>
        </li>
      </ul>
    </section>
  );
}
