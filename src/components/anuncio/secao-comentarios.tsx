import { lerComentarios } from "@/lib/comentarios";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { ComentariosDaVaga } from "./comentarios";

/** A seção dos comentários da vaga (lida no servidor). Sem a migração 20270318120000, não aparece. */
export async function SecaoComentarios({ anuncioId, agora }: { anuncioId: string; agora: number }) {
  if (MODO_DEMO) return null;
  const { data, error } = await (await criarClienteServidor()).rpc("comentarios_da_vaga", { p_anuncio: anuncioId });
  if (error) return null;
  const dados = lerComentarios(data);
  if (!dados) return null;
  return <ComentariosDaVaga anuncioId={anuncioId} dados={dados} agora={agora} />;
}
