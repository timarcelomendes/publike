import { NextResponse, type NextRequest } from "next/server";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { DISPONIBILIDADES, ETAPAS_CANDIDATO, nomeEscolaridade, TIPOS_CONTA } from "@/lib/constantes";
import {
  listarCurriculosDosInteressados,
  listarEtapasDosCandidatos,
  listarInteressados,
  obterAnuncio,
  obterUsuario,
} from "@/lib/dados";
import { formatarTelefone } from "@/lib/formato";
import { UUID } from "@/lib/validacao";

// A lista de quem curtiu uma vaga, para abrir no Excel ou no Google Planilhas.
// Só quem publicou baixa. O WhatsApp e o e-mail só vêm de quem deu match (o banco
// já esconde os outros), como na tela.

const SITUACAO: Record<string, string> = {
  pendente: "Aguardando sua resposta",
  match: "Deu match",
  dispensada: "Dispensado",
  desfeito: "Match desfeito",
};

/** Uma célula do CSV: entre aspas, e sem virar fórmula no Excel. */
function celula(valor: string | null | undefined) {
  let v = String(valor ?? "")
    .replace(/\r?\n/g, " ")
    .trim();
  if (/^[=+\-@\t]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

function data(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Nome do arquivo sem acento nem espaço: "candidatos-auxiliar-de-padaria.csv". */
function nomeDoArquivo(titulo: string) {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `candidatos-${base || "vaga"}.csv`;
}

export async function GET(_req: NextRequest, { params }: RouteContext<"/painel/anuncio/[id]/planilha">) {
  const { id } = await params;
  if (MODO_DEMO || !UUID.test(id)) return new NextResponse("Não encontrado.", { status: 404 });
  const usuario = await obterUsuario();
  if (!usuario) {
    return NextResponse.redirect(new URL(`/entrar?next=${encodeURIComponent(`/painel/anuncio/${id}`)}`, SITE_URL));
  }
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo === "servico") {
    return new NextResponse("Não encontrado.", { status: 404 });
  }

  const [interessados, curriculos, etapas] = await Promise.all([
    listarInteressados(id),
    listarCurriculosDosInteressados(id),
    listarEtapasDosCandidatos(id),
  ]);

  const cabecalho = [
    "Nome",
    "Conta",
    "Bairro",
    "Cidade",
    "Curtiu em",
    "Mensagem",
    "Situação",
    "Etapa",
    "Anotação",
    "WhatsApp",
    "E-mail",
    "Currículo",
    "Escolaridade",
    "CNH",
    "Disponibilidade",
    "Última experiência",
    "Perfil no Publike",
  ];
  const linhas = interessados.map((p) => {
    const e = etapas.get(p.perfil_id);
    const c = curriculos.get(p.perfil_id);
    const ultima = c?.experiencias[0];
    const tipo = TIPOS_CONTA[p.tipo as keyof typeof TIPOS_CONTA]?.nome ?? p.tipo;
    return [
      p.nome,
      tipo,
      p.bairro,
      p.cidade,
      data(p.curtido_em),
      p.mensagem,
      SITUACAO[p.status] ?? p.status,
      ETAPAS_CANDIDATO[e?.etapa ?? "novo"].nome,
      e?.nota,
      p.whatsapp ? formatarTelefone(p.whatsapp) : "",
      p.email,
      c ? "Sim" : "Não",
      nomeEscolaridade(c?.escolaridade) ?? "",
      c?.cnh,
      (c?.disponibilidade ?? []).map((d) => DISPONIBILIDADES.find((x) => x.valor === d)?.nome ?? d).join(", "),
      ultima ? [ultima.cargo, ultima.onde].filter(Boolean).join(" em ") : "",
      `${SITE_URL}/perfil/${p.perfil_id}`,
    ]
      .map(celula)
      .join(";");
  });

  // BOM + ponto e vírgula: o Excel em português abre com acentos e colunas certas.
  const corpo = "﻿" + [cabecalho.map(celula).join(";"), ...linhas].join("\r\n") + "\r\n";
  return new NextResponse(corpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nomeDoArquivo(anuncio.titulo)}"`,
      "cache-control": "private, no-store",
    },
  });
}
