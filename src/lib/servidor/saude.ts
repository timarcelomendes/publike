import "server-only";
import { esperaResposta } from "@/lib/constantes";
import { saudeDaVaga, type Saude } from "@/lib/saude-vaga";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { AnuncioCompleto } from "@/lib/tipos";
import { obterTriagens } from "./triagem";

type Curtida = { anuncio_id: string; status: string; aceita_em?: string | null; curtido_em: string };

/** A saúde de cada vaga minha, por id (Hoje e o quadro da vaga). */
export async function saudeDasVagas(
  vagas: AnuncioCompleto[],
  candidatos: Curtida[],
  agora: number,
): Promise<Map<string, Saude>> {
  const ids = vagas.map((v) => v.id);
  if (!ids.length) return new Map();
  const supabase = await criarClienteServidor();
  const [{ data: visitas }, triagens] = await Promise.all([
    supabase.from("anuncio_visitas").select("anuncio_id, total").in("anuncio_id", ids),
    obterTriagens(ids),
  ]);
  const visitasDe = new Map((visitas ?? []).map((v) => [v.anuncio_id, v.total]));
  return new Map(
    vagas.map((v) => {
      const daVaga = candidatos.filter((c) => c.anuncio_id === v.id);
      const esperandoMuito = daVaga.filter(
        (c) =>
          esperaResposta({ status: c.status, aceita_em: c.aceita_em ?? null }) &&
          agora - new Date(c.curtido_em).getTime() > 2 * 24 * 3600e3,
      ).length;
      return [
        v.id,
        saudeDaVaga(
          v,
          { visitas: visitasDe.get(v.id) ?? 0, candidatos: daVaga.length, esperandoMuito },
          triagens.get(v.id) ?? {},
          agora,
        ),
      ];
    }),
  );
}
