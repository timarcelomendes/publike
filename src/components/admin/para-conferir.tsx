"use client";

import { Type } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { arrumarTituloDoAnuncio } from "@/lib/acoes/admin";
import { tituloLegivel, type MotivoConferir } from "@/lib/conferir-anuncio";
import { formatarLugar } from "@/lib/formato";
import { Selo } from "../ui/basicos";
import { Botao, classesBotao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

type AnuncioParaConferir = {
  id: string;
  tipo: string;
  titulo: string;
  status: string;
  cidade: string;
  bairro: string | null;
  motivos: MotivoConferir[];
};

/**
 * Admin › Anúncios › Para conferir (claude/plano-home-visitante.md, item 2): o que derruba a confiança na vitrine.
 * O título gritando se arruma aqui; o outro estado e a outra cidade se resolvem na ficha (editar, pausar ou tirar).
 */
export function ListaParaConferir({ anuncios }: { anuncios: AnuncioParaConferir[] }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Anúncios para conferir">
      {anuncios.map((a) => (
        <LinhaParaConferir key={a.id} a={a} />
      ))}
    </ul>
  );
}

function LinhaParaConferir({ a }: { a: AnuncioParaConferir }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [titulo, setTitulo] = useState(a.titulo);
  const gritando = a.motivos.some((m) => m.tipo === "gritando") && titulo === a.titulo;
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Selo>{a.tipo === "vaga" ? "Vaga" : "Serviço"}</Selo>
        {a.status !== "ativo" && <Selo variante="aviso">{a.status === "pausado" ? "Pausado" : "Em análise"}</Selo>}
        <Link href={`/admin/anuncios/${a.id}`} className="text-label hover:underline">
          {titulo}
        </Link>
        <span className="text-body-sm text-ink-muted">{formatarLugar(a.bairro, a.cidade)}</span>
      </div>
      <ul className="flex flex-col gap-0.5 text-body-sm">
        {a.motivos
          .filter((m) => m.tipo !== "gritando" || titulo === a.titulo)
          .map((m) => (
            <li key={m.tipo} className="text-terra-text">
              {m.texto}
            </li>
          ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        {gritando && (
          <Botao
            tamanho="sm"
            disabled={pendente}
            onClick={() =>
              rodar(
                () => arrumarTituloDoAnuncio(a.id),
                (r) => r.ok && setTitulo(tituloLegivel(a.titulo)),
              )
            }
          >
            <Type aria-hidden />
            Arrumar: “{tituloLegivel(a.titulo)}”
          </Botao>
        )}
        <Link href={`/admin/anuncios/${a.id}`} className={classesBotao("fantasma", "sm")}>
          Abrir a ficha
        </Link>
      </div>
      {mensagem}
    </li>
  );
}
