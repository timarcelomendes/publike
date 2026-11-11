"use client";

import { Send } from "lucide-react";
import { useState } from "react";
import { chamarParaMutirao } from "@/lib/acoes/mutirao";
import type { ParaChamar } from "@/lib/mutirao";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/**
 * Chamar para o mutirão: quem curtiu cada vaga e ainda não foi chamado, com a marca de todos e o "Chamar". Cada
 * pessoa recebe o aviso (sino, celular e e-mail) e escolhe o horário.
 */
export function ChamarParaMutirao({ mutirao, pessoas }: { mutirao: string; pessoas: ParaChamar[] }) {
  const { rodar, pendente, mensagem } = useAcao();
  const vagas = [...new Map(pessoas.map((p) => [p.anuncio, p.vaga])).entries()];
  const [vaga, setVaga] = useState(vagas[0]?.[0] ?? "");
  const daVaga = pessoas.filter((p) => p.anuncio === vaga);
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const todas = daVaga.length > 0 && daVaga.every((p) => marcadas.includes(p.perfil));

  if (!pessoas.length) {
    return (
      <p className="text-body-sm text-ink-muted">
        Ninguém novo para chamar: quem curtir as vagas do mutirão aparece aqui. Divulgue a vaga com o cartaz do Kit de
        divulgação.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {vagas.length > 1 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Vaga">
          {vagas.map(([id, titulo]) => (
            <button
              key={id}
              type="button"
              aria-pressed={vaga === id}
              onClick={() => {
                setVaga(id);
                setMarcadas([]);
              }}
              className={`min-h-9 rounded-pill border px-3.5 text-body-sm font-semibold ${
                vaga === id ? "border-ink bg-ink text-surface-100" : "border-line-strong text-ink"
              }`}
            >
              {titulo} ({pessoas.filter((p) => p.anuncio === id).length})
            </button>
          ))}
        </div>
      )}
      <label className="flex min-h-10 items-center gap-3 text-label">
        <input
          type="checkbox"
          checked={todas}
          onChange={(e) => setMarcadas(e.target.checked ? daVaga.map((p) => p.perfil) : [])}
          className="size-4 accent-terra"
        />
        Marcar todos ({daVaga.length})
      </label>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
        {daVaga.map((p) => (
          <li key={`${p.anuncio}:${p.perfil}`}>
            <label className="flex min-h-12 items-center gap-3 px-4 py-2">
              <input
                type="checkbox"
                checked={marcadas.includes(p.perfil)}
                onChange={(e) =>
                  setMarcadas((x) => (e.target.checked ? [...x, p.perfil] : x.filter((y) => y !== p.perfil)))
                }
                className="size-4 accent-terra"
              />
              <span className="min-w-0 flex-1 text-body">{p.nome}</span>
              {p.match && <Selo variante="match">Match</Selo>}
            </label>
          </li>
        ))}
      </ul>
      <Botao
        variante="primario"
        className="self-start"
        disabled={pendente || !marcadas.length}
        onClick={() => rodar(() => chamarParaMutirao(mutirao, vaga, marcadas), (r) => r.ok && setMarcadas([]))}
      >
        <Send aria-hidden />
        {marcadas.length ? `Chamar ${marcadas.length === 1 ? "1 pessoa" : `${marcadas.length} pessoas`}` : "Chamar"}
      </Botao>
      {mensagem}
    </div>
  );
}
