import "server-only";
import { ehMotivo, type EmpresaParaContato } from "@/lib/manter-contato";
import type { ClienteBanco } from "@/lib/supabase/admin";

// As empresas que vieram dos convites e já publicaram (têm conta), com a vaga mais recente, os candidatos dela e o
// último contato. Só no admin (o cliente da chave de serviço).

type LinhaConvite = {
  id: string;
  nome: string;
  whatsapp: string[];
  usuario_id: string;
  contato_em?: string | null;
  contato_motivo?: string | null;
};

export async function empresasParaContato(
  c: ClienteBanco,
  agora: number,
): Promise<{ empresas: EmpresaParaContato[]; semMigracao: boolean } | null> {
  const base = c.from("convites");
  let semMigracao = false;
  let r = await base
    .select("id, nome, whatsapp, usuario_id, status, contato_em, contato_motivo")
    .not("usuario_id", "is", null)
    .neq("status", "recusou")
    .limit(1000);
  if (r.error && /contato_/.test(r.error.message)) {
    semMigracao = true;
    r = (await base
      .select("id, nome, whatsapp, usuario_id, status")
      .not("usuario_id", "is", null)
      .neq("status", "recusou")
      .limit(1000)) as typeof r;
  }
  if (r.error) return null;
  const convites = (r.data ?? []) as unknown as LinhaConvite[];
  const ids = [...new Set(convites.map((x) => x.usuario_id))];
  if (!ids.length) return { empresas: [], semMigracao };

  const { data: anuncios, error } = await c
    .from("anuncios")
    .select("id, autor_id, titulo, status, expira_em, criado_em")
    .in("autor_id", ids)
    .eq("tipo", "vaga")
    .order("criado_em", { ascending: false })
    .limit(5000);
  if (error) return null;
  const noAr = (a: { status: string; expira_em: string | null }) =>
    a.status === "ativo" && (!a.expira_em || new Date(a.expira_em).getTime() > agora);
  const porAutor = new Map<string, NonNullable<typeof anuncios>>();
  for (const a of anuncios ?? []) porAutor.set(a.autor_id, [...(porAutor.get(a.autor_id) ?? []), a]);

  // a vaga que conta: a mais recente no ar; sem nenhuma no ar, a mais recente
  const escolhida = new Map<string, NonNullable<typeof anuncios>[number]>();
  for (const [autor, lista] of porAutor) escolhida.set(autor, lista.find(noAr) ?? lista[0]);
  const vagaIds = [...escolhida.values()].map((a) => a.id);
  const candidatos = new Map<string, number>();
  if (vagaIds.length) {
    const { data: curtidas } = await c.from("curtidas").select("anuncio_id").in("anuncio_id", vagaIds).limit(20000);
    for (const x of curtidas ?? []) candidatos.set(x.anuncio_id, (candidatos.get(x.anuncio_id) ?? 0) + 1);
  }

  const empresas = convites
    .filter((x) => porAutor.has(x.usuario_id))
    .map((x): EmpresaParaContato => {
      const lista = porAutor.get(x.usuario_id)!;
      const v = escolhida.get(x.usuario_id)!;
      return {
        id: x.id,
        nome: x.nome,
        whatsapp: x.whatsapp?.[0] ?? null,
        vaga: {
          titulo: v.titulo,
          candidatos: candidatos.get(v.id) ?? 0,
          no_ar: noAr(v),
          expira_em: v.expira_em,
          criado_em: v.criado_em,
        },
        publicadas: lista.length,
        no_ar: lista.filter(noAr).length,
        contato_em: x.contato_em ?? null,
        contato_motivo: ehMotivo(x.contato_motivo) ? x.contato_motivo : null,
      };
    });
  return { empresas, semMigracao };
}
