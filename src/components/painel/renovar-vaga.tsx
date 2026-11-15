"use client";

import { RefreshCw, UserCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { marcarVagaPreenchida, mudarStatusAnuncio, renovarAnuncio } from "@/lib/acoes/anuncios";
import { quemPodeTerSidoContratado, registrarQuemContratou } from "@/lib/acoes/processo";
import { moverCandidatos } from "@/lib/acoes/recrutamento";
import { Botao, BotaoLink } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";
import { QuemVoceContratou } from "./acoes";

/**
 * Renovar em um toque ou "Já preenchi" (migração 20270529120000). O "Já preenchi" pergunta quem foi contratado
 * (opcional): a vaga no ar fica com a marcação "Vaga preenchida"; a que já saiu do ar fica encerrada.
 */
export function RenovarOuPreencher({ id, prazoDias, noAr }: { id: string; prazoDias: number; noAr: boolean }) {
  const { rodar, pendente, mensagem } = useAcao();
  const [feito, setFeito] = useState<"renovada" | "preenchida" | null>(null);
  const [preencher, setPreencher] = useState(false);
  const [quem, setQuem] = useState<{ contratados: number; candidatos: { id: string; nome: string }[] } | null>(null);
  const [marcados, setMarcados] = useState<string[]>([]);
  const [ninguem, setNinguem] = useState(false);
  const [carregando, iniciarCarga] = useTransition();
  const perguntar = quem && quem.contratados === 0 && quem.candidatos.length > 0;

  if (feito) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4">
        <p className="text-body">
          {feito === "renovada"
            ? `Pronto: a vaga voltou para quem procura e fica no ar por mais ${prazoDias} dias.`
            : "Pronto, obrigado por contar. Quem curtiu e ainda esperava recebe o aviso."}
        </p>
        <div className="flex flex-wrap gap-2">
          <BotaoLink href={`/painel/anuncio/${id}`} tamanho="sm">
            Ver os candidatos
          </BotaoLink>
          {feito === "preenchida" && (
            <BotaoLink href={`/publicar?copiar=${id}`} tamanho="sm" variante="fantasma">
              Publicar outra parecida
            </BotaoLink>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {!preencher && (
        <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
          <p className="text-label">Ainda está contratando?</p>
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="primario"
              disabled={pendente}
              onClick={() => rodar(() => renovarAnuncio(id), (r) => r.ok && setFeito("renovada"))}
            >
              <RefreshCw aria-hidden />
              Renovar por {prazoDias} dias
            </Botao>
            <Botao
              variante="fantasma"
              disabled={pendente}
              onClick={() => {
                setPreencher(true);
                iniciarCarga(async () => setQuem(await quemPodeTerSidoContratado(id).catch(() => null)));
              }}
            >
              <UserCheck aria-hidden />
              Já preenchi
            </Botao>
          </div>
        </div>
      )}
      {preencher && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4">
          {carregando ? (
            <p className="text-body-sm text-ink-muted">Carregando os candidatos…</p>
          ) : perguntar ? (
            <QuemVoceContratou
              id={id}
              candidatos={quem.candidatos}
              marcados={marcados}
              ninguem={ninguem}
              onMarcar={(l) => {
                setMarcados(l);
                setNinguem(false);
              }}
              onNinguem={() => {
                setMarcados([]);
                setNinguem(true);
              }}
            />
          ) : (
            <p className="text-body">Que bom que preencheu.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Botao
              variante="sucesso"
              disabled={pendente || carregando}
              onClick={() =>
                rodar(
                  async () => {
                    if (marcados.length) {
                      const r = await moverCandidatos(id, marcados, "contratado");
                      if (!r.ok) return r;
                      if (r.falhas.length)
                        return {
                          ok: false as const,
                          erro: `${r.falhas.map((f) => `${f.perfil}: ${f.erro}`).join(" ")} Desmarque ou resolva na ficha.`,
                        };
                    }
                    const r = noAr
                      ? await marcarVagaPreenchida(id, true)
                      : await mudarStatusAnuncio(
                          id,
                          "encerrado",
                          marcados.length
                            ? { motivo: "contratei_publike" }
                            : ninguem
                              ? { motivo: "contratei_fora" }
                              : null,
                        );
                    if (r.ok && perguntar)
                      await registrarQuemContratou(id, marcados, ninguem, noAr ? "preenchida" : "encerrar").catch(
                        () => undefined,
                      );
                    return r;
                  },
                  (r) => r.ok && setFeito("preenchida"),
                )
              }
            >
              Confirmar
            </Botao>
            <Botao variante="fantasma" disabled={pendente} onClick={() => setPreencher(false)}>
              Voltar
            </Botao>
          </div>
        </div>
      )}
      {mensagem}
      <Link href={`/painel/anuncio/${id}`} className="self-start text-body-sm text-ink-muted underline underline-offset-2">
        Ver a vaga e os candidatos
      </Link>
    </div>
  );
}
