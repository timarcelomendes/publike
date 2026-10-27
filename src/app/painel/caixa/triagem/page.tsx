import type { Metadata } from "next";
import { trabalhaAqui } from "@/lib/experiencia";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { TriagemRapida, type CartaTriagem } from "@/components/painel/triagem-rapida";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { textosDosEstudos } from "@/lib/estudos";
import { formatarLugar, primeiro, tempoRelativo } from "@/lib/formato";
import { montarCaixa, naAba, ordenar } from "@/lib/servidor/caixa";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Triagem rápida" };

// Triagem rápida: quem espera resposta, um cartão por vez (os que mais combinam
// primeiro). Pensada para o celular: arrastar decide.

export default function Triagem({ searchParams }: PageProps<"/painel/caixa/triagem">) {
  return (
    <Suspense fallback={<EsqueletoLista quantos={1} />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/caixa/triagem">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/caixa/triagem");
  const sp = await searchParams;
  const agora = await agoraDaRequisicao();
  const itens = await montarCaixa(agora);
  if (!itens) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar os candidatos agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const pedida = primeiro(sp.vaga);
  const vaga = pedida && UUID.test(pedida) ? pedida : null;
  const fila = ordenar(
    "responder",
    itens.filter((c) => naAba.responder(c) && (!vaga || c.anuncio_id === vaga) && c.anuncio_status !== "em_analise"),
  );

  const cartas: CartaTriagem[] = fila.map((c) => {
    const estudos = c.curriculo ? textosDosEstudos(c.curriculo) : [];
    return {
      anuncioId: c.anuncio_id,
      perfilId: c.perfil_id,
      nome: c.nome,
      foto: c.foto,
      vaga: c.anuncio_titulo,
      lugar: formatarLugar(c.bairro, c.cidade),
      quando: `curtiu ${tempoRelativo(c.curtido_em, agora)}`,
      nota: c.aderencia?.nota ?? null,
      eliminado: Boolean(c.aderencia?.eliminado),
      atendidos: c.aderencia?.atendidos ?? 0,
      conferidos: c.aderencia?.conferidos ?? 0,
      emParte: c.aderencia?.emParte ?? 0,
      criterios: (c.aderencia?.criterios ?? [])
        .slice(0, 6)
        .map((k) => ({ nome: k.nome, ok: k.ok, parte: k.parte, extra: k.extra, eliminatorio: k.eliminatorio })),
      recado: c.mensagem,
      estudo: estudos.length ? estudos.join("; ") : null,
      titulo: c.curriculo?.titulo ?? null,
      experiencias: (c.curriculo?.experiencias ?? [])
        .slice(0, 3)
        .map((e) => [e.cargo, e.onde].filter(Boolean).join(" · ") + (trabalhaAqui(e) ? " (atual)" : "")),
      temCurriculo: Boolean(c.curriculo),
      semCurriculo: c.semCurriculo,
      respostas: c.respostas,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-h2">Triagem rápida</h2>
        <p className="mt-1 text-body text-ink-muted">
          Quem mais combina com a vaga vem primeiro. Para a direita aceita, para a esquerda dispensa.
        </p>
      </div>
      <TriagemRapida cartas={cartas} />
    </div>
  );
}
