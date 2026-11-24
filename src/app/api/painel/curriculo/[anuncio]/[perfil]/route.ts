import { connection } from "next/server";
import type { CurriculoMontado } from "@/lib/curriculo-pelo-whatsapp";
import { listarCurriculosDosInteressados } from "@/lib/dados";
import { pdfDoCurriculo } from "@/lib/servidor/arquivos-do-curriculo";
import { nomeDoPdf } from "@/lib/servidor/curriculo-pelo-whatsapp";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// "Baixar currículo em PDF" no painel (24/11/2026; Marcelo: "Tem como a empresa fazer download do currículo?"). Só
// para quem anunciou a vaga (o banco confere em `curriculos_dos_interessados`). Quem anexou um PDF: o arquivo dele.
// Quem preencheu no site: o Publike monta o PDF (uma página A4, o mesmo do currículo pelo WhatsApp), sem o contato
// (o contato segue as regras do painel).

export async function GET(
  _pedido: Request,
  { params }: { params: Promise<{ anuncio: string; perfil: string }> },
) {
  await connection();
  const { anuncio, perfil } = await params;
  if (!UUID.test(anuncio) || !UUID.test(perfil))
    return new Response("Pedido inválido.", { status: 400 });
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return new Response("Entre na sua conta para baixar o currículo.", {
      status: 401,
    });

  let curriculos;
  try {
    curriculos = await listarCurriculosDosInteressados(anuncio);
  } catch {
    return new Response("Não deu para ler o currículo agora. Tente de novo.", {
      status: 500,
    });
  }
  const cv = curriculos.get(perfil);
  if (!cv)
    return new Response("Este currículo não está nas suas vagas.", {
      status: 404,
    });

  const { data: p } = await supabase
    .from("perfis")
    .select("nome")
    .eq("id", perfil)
    .maybeSingle();
  const nome = (p?.nome ?? "")
    .replace(/[^\p{L}\p{M} '.-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const arquivoNome = nomeDoPdf(nome);
  const cabecalhos = {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="${arquivoNome}"`,
    "cache-control": "private, no-store",
    "x-robots-tag": "noindex",
  };

  // o PDF que a pessoa anexou
  if (cv.arquivo) {
    const { data: arquivo } = await supabase.storage
      .from("curriculos")
      .download(cv.arquivo);
    if (arquivo)
      return new Response(await arquivo.arrayBuffer(), { headers: cabecalhos });
  }

  // o currículo preenchido no site
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
  const montado: CurriculoMontado = {
    titulo: cv.titulo ?? "",
    resumo: cv.resumo ?? "",
    habilidades: cv.habilidades ?? [],
    escolaridade: cv.escolaridade ?? "",
    curso: cv.curso ?? "",
    estudos: cv.estudos ?? [],
    experiencias: cv.experiencias.map((x) => ({
      cargo: x.cargo,
      onde: [x.onde, x.unidade].filter(Boolean).join(", "),
      inicio: x.inicio ?? "",
      fim: x.fim ?? "",
      atual: Boolean(x.atual),
      descricao: x.descricao ?? "",
    })),
    cursos: cv.cursos ?? [],
    cnh: cv.cnh ?? "",
    disponibilidade: cv.disponibilidade ?? [],
  };
  const pdf = await pdfDoCurriculo(montado, nome, null, hoje);
  return new Response(new Uint8Array(pdf), { headers: cabecalhos });
}
