"use client";

import { CircleCheck, Clock, Download, FolderCheck, Truck } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { marcarDocumentosEntregues } from "@/lib/acoes/documentos-admissao";
import { contaDosDocumentos, type DocumentosDaProposta } from "@/lib/documentos-admissao";
import { dataEHora } from "@/lib/proposta";
import { Selo } from "../ui/basicos";
import { Botao, classesBotao } from "../ui/botao";

// Os documentos da admissão na ficha de quem contrata (migração 20270312120000): "Documentos: 7 de 9", o que falta,
// "Baixar tudo" (.zip para o contador) e "Entregue ao contador" (os arquivos somem em 7 dias).

export function DocumentosNaFicha({
  anuncioId,
  perfilId,
  nome,
  docs,
}: {
  anuncioId: string;
  perfilId: string;
  nome: string;
  docs: DocumentosDaProposta;
}) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const conta = contaDosDocumentos(docs);
  const apagados = docs.vencido;
  const temArquivo = docs.itens.some((i) => i.arquivos > 0);
  const pronto = conta.faltam === 0;
  if (conta.total === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line p-3">
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-label">
          Documentos: {conta.enviados + conta.levar} de {conta.total}
        </span>
        <Selo variante="novo">Novo</Selo>
        {docs.entreguesEm && <Selo variante="match">Entregue ao contador</Selo>}
      </p>
      {!docs.aceiteEm && !apagados && (
        <p className="text-body-sm text-ink-muted">
          {nome} ainda não abriu a lista. Ela recebe o aviso 2 dias antes do primeiro dia se faltar algo.
        </p>
      )}
      {apagados ? (
        <p className="text-body-sm text-ink-muted">Os arquivos já saíram do Publike, como combinado.</p>
      ) : (
        <ul className="flex flex-col gap-1 text-body-sm">
          {docs.itens
            .filter((i) => i.seEnvia)
            .map((i) => (
              <li key={i.item} className="flex items-start gap-2">
                {i.situacao === "enviado" ? (
                  <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-cerrado-text" />
                ) : i.situacao === "levar" ? (
                  <Truck aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                ) : (
                  <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-terra-text" />
                )}
                <span>
                  {i.item}
                  <span className="text-ink-muted">
                    {i.situacao === "enviado"
                      ? i.arquivos > 1
                        ? ` (${i.arquivos} arquivos)`
                        : ""
                      : i.situacao === "levar"
                        ? ": leva no primeiro dia"
                        : ": falta"}
                  </span>
                </span>
              </li>
            ))}
        </ul>
      )}
      {!apagados && (temArquivo || !docs.entreguesEm) && (
        <div className="flex flex-wrap gap-2">
          {temArquivo && (
            <a
              href={`/painel/anuncio/${anuncioId}/documentos/${perfilId}`}
              className={classesBotao("secundario", "sm")}
              download
            >
              <Download aria-hidden />
              Baixar tudo (.zip)
            </a>
          )}
          {!docs.entreguesEm && (temArquivo || pronto) && (
            <Botao
              tamanho="sm"
              variante="fantasma"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  setAviso(null);
                  const r = await chamarAcao(() => marcarDocumentosEntregues(anuncioId, perfilId));
                  setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Pronto." } : { ok: false, texto: r.erro });
                })
              }
            >
              <FolderCheck aria-hidden />
              Entregue ao contador
            </Botao>
          )}
        </div>
      )}
      <p className="text-caption text-ink-muted">
        {docs.entreguesEm
          ? `Entregue em ${dataEHora(docs.entreguesEm)}. Os arquivos somem do Publike em até 7 dias.`
          : "Os arquivos ficam no Publike até 7 dias depois da entrega ao contador ou 30 dias depois do primeiro dia. Só você e a pessoa abrem."}
      </p>
      {aviso && (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
