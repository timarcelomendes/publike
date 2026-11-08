import { BUCKET_DOCUMENTOS, nomeNoZip } from "@/lib/documentos-admissao";
import { obterUsuario } from "@/lib/dados";
import { documentosDoContratado } from "@/lib/servidor/documentos-admissao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";
import { montarZip, type ArquivoDoZip } from "@/lib/zip";

// "Baixar tudo" (migração 20270312120000): os documentos de um contratado num .zip, para o contador. Lê com o login de
// quem contrata (o Storage confere a vaga e o prazo) e não guarda cópia.
export const maxDuration = 60;

function nomeDoArquivo(nome: string) {
  const limpo = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `documentos-${limpo || "contratado"}.zip`;
}

export async function GET(_: Request, { params }: RouteContext<"/painel/anuncio/[id]/documentos/[perfil]">) {
  const { id, perfil } = await params;
  if (!UUID.test(id) || !UUID.test(perfil)) return new Response("Não encontrado.", { status: 404 });
  if (!(await obterUsuario())) return new Response("Entre na sua conta.", { status: 401 });
  const docs = await documentosDoContratado(id, perfil);
  if (!docs) return new Response("Não encontrado.", { status: 404 });
  const supabase = await criarClienteServidor();
  const arquivos: ArquivoDoZip[] = [];
  let ordem = 0;
  for (const item of docs.itens) {
    if (!item.caminhos.length) continue;
    ordem += 1;
    for (const [i, caminho] of item.caminhos.entries()) {
      const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).download(caminho);
      if (error || !data) continue;
      arquivos.push({
        nome: nomeNoZip(ordem, item.item, i + 1, item.caminhos.length, caminho),
        dados: new Uint8Array(await data.arrayBuffer()),
      });
    }
  }
  if (!arquivos.length) return new Response("Nenhum documento para baixar.", { status: 404 });
  return new Response(Buffer.from(montarZip(arquivos)), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${nomeDoArquivo(docs.nome)}"`,
      "cache-control": "private, no-store",
    },
  });
}
