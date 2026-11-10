"use client";

import { CopyX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { encerrarAnuncioRepetido } from "@/lib/acoes/admin-contas";
import { formatarDataHora, formatarLugar } from "@/lib/formato";
import { Selo } from "../ui/basicos";
import { Botao, classesBotao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

export type ParRepetido = {
  copia_id: string;
  original_id: string;
  tipo: string;
  titulo: string;
  cidade: string;
  bairro: string | null;
  autor_id: string;
  autor_nome: string | null;
  copia_status: string;
  original_status: string;
  copia_criada: string;
  original_criada: string;
  copia_curtidas: number;
  original_curtidas: number;
};

const SITUACAO: Record<string, string> = { ativo: "No ar", em_analise: "Em análise", pausado: "Pausado" };

/**
 * Admin › Anúncios › Repetidos: a mesma conta publicou o mesmo anúncio duas vezes (antes de o banco barrar, migração
 * 20270404120000). "Encerrar a cópia e avisar" deixa no ar a que tem mais curtidas e manda a mensagem da equipe.
 */
export function ListaRepetidos({ pares }: { pares: ParRepetido[] }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Anúncios repetidos">
      {pares.map((p) => (
        <LinhaRepetido key={p.copia_id} p={p} />
      ))}
    </ul>
  );
}

function LinhaRepetido({ p }: { p: ParRepetido }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [encerrada, setEncerrada] = useState(false);
  const segundos = Math.round((Date.parse(p.copia_criada) - Date.parse(p.original_criada)) / 1000);
  const diferenca = segundos < 120 ? `${segundos} segundos` : `${Math.round(segundos / 60)} minutos`;
  const fica = p.copia_curtidas > p.original_curtidas ? "a segunda" : "a primeira";
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Selo>{p.tipo === "vaga" ? "Vaga" : "Serviço"}</Selo>
        <span className="text-label">{p.titulo}</span>
        <span className="text-body-sm text-ink-muted">{formatarLugar(p.bairro, p.cidade)}</span>
      </div>
      <p className="text-body-sm">
        {p.autor_nome ? (
          <Link href={`/admin/usuarios/${p.autor_id}`} className="font-semibold hover:underline">
            {p.autor_nome}
          </Link>
        ) : (
          "Conta sem nome"
        )}{" "}
        publicou duas vezes, com {diferenca} de diferença.
      </p>
      <ul className="flex flex-col gap-0.5 text-body-sm text-ink-muted">
        <li>
          <Link href={`/admin/anuncios/${p.original_id}`} className="hover:underline">
            Primeira
          </Link>
          : {formatarDataHora(p.original_criada)}, {SITUACAO[p.original_status] ?? p.original_status},{" "}
          {p.original_curtidas === 1 ? "1 curtida" : `${p.original_curtidas} curtidas`}
        </li>
        <li>
          <Link href={`/admin/anuncios/${p.copia_id}`} className="hover:underline">
            Segunda
          </Link>
          : {formatarDataHora(p.copia_criada)}, {SITUACAO[p.copia_status] ?? p.copia_status},{" "}
          {p.copia_curtidas === 1 ? "1 curtida" : `${p.copia_curtidas} curtidas`}
        </li>
      </ul>
      {!encerrada && (
        <div className="flex flex-wrap items-center gap-2">
          <Botao tamanho="sm" disabled={pendente} onClick={() => rodar(
                () => encerrarAnuncioRepetido(p.copia_id),
                // encerrou (mesmo se o aviso falhou, a mensagem diz): o botão sai
                (r) => (r.ok || r.erro.startsWith("A cópia foi encerrada")) && setEncerrada(true),
              )}>
            <CopyX aria-hidden />
            Encerrar a cópia e avisar
          </Botao>
          <span className="text-body-sm text-ink-muted">Fica no ar {fica}, a de mais curtidas.</span>
          <Link href={`/admin/anuncios/${p.copia_id}`} className={classesBotao("fantasma", "sm")}>
            Abrir a ficha
          </Link>
        </div>
      )}
      {mensagem}
    </li>
  );
}
