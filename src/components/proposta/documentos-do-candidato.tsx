"use client";

import { Camera, CircleCheck, LoaderCircle, ShieldCheck, Trash2, Truck } from "lucide-react";
import { useState, useTransition, type ChangeEvent } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import {
  aceitarTermoDosDocumentos,
  apagarMeusDocumentos,
  registrarDocumento,
  vouLevarODocumento,
} from "@/lib/acoes/documentos-admissao";
import {
  BUCKET_DOCUMENTOS,
  contaDosDocumentos,
  extensaoDoArquivo,
  MAX_ARQUIVOS_POR_ITEM,
  MAX_MB_DOCUMENTO,
  TIPOS_DOCUMENTO,
  type DocumentosDaProposta,
  type ItemDocumento,
} from "@/lib/documentos-admissao";
import { textoDoDia } from "@/lib/proposta";
import { reduzirImagem } from "@/lib/reduzir-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";

// "Mandar os documentos" na página da proposta aceita (migração 20270312120000): o termo (a empresa é a controladora; o
// Publike, o operador), e em cada item a foto ou o PDF, ou "Vou levar no primeiro dia". Sem IA.

/** A foto vai reduzida (até 2000 px, JPEG); o PDF vai como está. */
async function prepararArquivo(arquivo: File): Promise<{ dados: Blob; tipo: string }> {
  if (arquivo.type === "application/pdf") return { dados: arquivo, tipo: arquivo.type };
  try {
    return { dados: await reduzirImagem(arquivo, 2000), tipo: "image/jpeg" };
  } catch {
    // o navegador não abre a foto (HEIC no computador, por exemplo): vai como está
    return { dados: arquivo, tipo: arquivo.type || "image/jpeg" };
  }
}

export function DocumentosDoCandidato({
  anuncioId,
  usuarioId,
  empresa,
  docs,
}: {
  anuncioId: string;
  usuarioId: string;
  empresa: string;
  docs: DocumentosDaProposta;
}) {
  const [concordo, setConcordo] = useState(false);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const conta = contaDosDocumentos(docs);
  const entregue = Boolean(docs.entreguesEm);
  const vencido = docs.vencido;
  const temArquivo = docs.itens.some((i) => i.arquivos > 0);
  const naoSaoArquivo = docs.itens.filter((i) => !i.seEnvia);

  return (
    <section
      id="documentos"
      aria-labelledby="documentos-titulo"
      className="flex scroll-mt-24 flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5"
    >
      <div>
        <h2 id="documentos-titulo" className="flex flex-wrap items-center gap-2 text-h3">
          Mandar os documentos
          <Selo variante="novo">Novo</Selo>
        </h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          {conta.total > 0
            ? `${empresa} pediu ${conta.total === 1 ? "1 documento" : `${conta.total} documentos`} para o registro. Mande a foto pelo celular ou leve no primeiro dia (${textoDoDia(docs.inicio)}).`
            : `Leve no primeiro dia (${textoDoDia(docs.inicio)}) o que ${empresa} pediu.`}
        </p>
      </div>

      {vencido ? (
        <p className="text-body-sm text-ink-muted">Os arquivos já saíram do Publike, como combinado.</p>
      ) : !docs.aceiteEm ? (
        conta.total > 0 && (
          <div className="flex flex-col gap-3 rounded-md bg-surface-300 p-4 text-body-sm">
            <p className="flex items-start gap-2">
              <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-cerrado-text" />
              <span>
                Os documentos vão só para {empresa}, que decide o que fazer com eles (é a responsável pelos seus dados).
                O Publike só guarda os arquivos: ninguém mais abre, nenhuma IA lê, e eles somem 7 dias depois que{" "}
                {empresa} entregar ao contador, ou 30 dias depois do primeiro dia. Antes da entrega, você apaga quando
                quiser.
              </span>
            </p>
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={concordo}
                onChange={(e) => setConcordo(e.target.checked)}
                className="size-5 shrink-0 accent-[var(--pk-ink)]"
              />
              Concordo em mandar os meus documentos para {empresa} pelo Publike
            </label>
            <div>
              <Botao
                variante="primario"
                disabled={!concordo || pendente}
                onClick={() =>
                  iniciar(async () => {
                    setErro(null);
                    const r = await chamarAcao(() => aceitarTermoDosDocumentos(anuncioId));
                    if (!r.ok) setErro(r.erro);
                  })
                }
              >
                {pendente ? <LoaderCircle aria-hidden className="animate-spin" /> : <Camera aria-hidden />}
                Começar
              </Botao>
            </div>
          </div>
        )
      ) : (
        <>
          <p className="text-label">
            {conta.faltam === 0
              ? "Tudo certo: a lista está completa."
              : `Faltam ${conta.faltam} de ${conta.total}.`}
          </p>
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {docs.itens
              .filter((i) => i.seEnvia)
              .map((i) => (
                <LinhaDoDocumento
                  key={i.item}
                  anuncioId={anuncioId}
                  pasta={`${usuarioId}/${docs.propostaId}`}
                  item={i}
                  travado={entregue}
                />
              ))}
          </ul>
          {entregue ? (
            <p className="text-body-sm text-ink-muted">
              {empresa} já entregou os documentos ao contador. Os arquivos somem do Publike em até 7 dias.
            </p>
          ) : (
            temArquivo && (
              <div>
                <Botao
                  tamanho="sm"
                  variante="fantasma"
                  disabled={pendente}
                  onClick={() =>
                    iniciar(async () => {
                      setErro(null);
                      const r = await chamarAcao(() => apagarMeusDocumentos(anuncioId));
                      if (!r.ok) setErro(r.erro);
                    })
                  }
                >
                  <Trash2 aria-hidden />
                  Apagar os arquivos que mandei
                </Botao>
              </div>
            )
          )}
        </>
      )}

      {naoSaoArquivo.length > 0 && (
        <ul className="flex flex-col gap-1 text-body-sm text-ink-muted">
          {naoSaoArquivo.map((i) => (
            <li key={i.item}>
              {i.item.replace(/\s*\(.*\)$/, "")}: {/^exame/i.test(i.item) ? `${empresa} marca e avisa você.` : "a empresa registra pelo eSocial."}
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}

function LinhaDoDocumento({
  anuncioId,
  pasta,
  item,
  travado,
}: {
  anuncioId: string;
  pasta: string;
  item: ItemDocumento;
  travado: boolean;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const id = `doc-${item.item.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;

  function escolher(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!arquivos.length) return;
    if (arquivos.length > MAX_ARQUIVOS_POR_ITEM) return setErro(`Escolha até ${MAX_ARQUIVOS_POR_ITEM} arquivos.`);
    setErro(null);
    iniciar(async () => {
      const supabase = criarClienteNavegador();
      const caminhos: string[] = [];
      for (const arquivo of arquivos) {
        const { dados, tipo } = await prepararArquivo(arquivo);
        if (dados.size > MAX_MB_DOCUMENTO * 1024 * 1024) {
          setErro(`Cada arquivo vai até ${MAX_MB_DOCUMENTO} MB.`);
          return;
        }
        const caminho = `${pasta}/${crypto.randomUUID()}.${extensaoDoArquivo(tipo)}`;
        const { error } = await supabase.storage
          .from(BUCKET_DOCUMENTOS)
          .upload(caminho, dados, { contentType: tipo, upsert: false });
        if (error) {
          if (caminhos.length) await supabase.storage.from(BUCKET_DOCUMENTOS).remove(caminhos);
          setErro("Não deu para mandar o arquivo. Confira a internet e tente de novo.");
          return;
        }
        caminhos.push(caminho);
      }
      const r = await chamarAcao(() => registrarDocumento(anuncioId, item.item, caminhos));
      if (!r.ok) setErro(r.erro);
    });
  }

  const levar = () =>
    iniciar(async () => {
      setErro(null);
      const r = await chamarAcao(() => vouLevarODocumento(anuncioId, item.item, item.situacao !== "levar"));
      if (!r.ok) setErro(r.erro);
    });

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="flex min-w-0 flex-1 basis-48 items-start gap-2 text-body">
          {item.situacao === "enviado" ? (
            <CircleCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-cerrado-text" />
          ) : item.situacao === "levar" ? (
            <Truck aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          ) : (
            <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-pill border-2 border-line-strong" />
          )}
          <span>
            {item.item}
            <span className="block text-body-sm text-ink-muted">
              {item.situacao === "enviado"
                ? `Enviado${item.arquivos > 1 ? ` (${item.arquivos} arquivos)` : ""}`
                : item.situacao === "levar"
                  ? "Você leva no primeiro dia"
                  : "Falta"}
            </span>
          </span>
        </p>
        {!travado && (
          <div className="flex flex-wrap gap-2">
            <label
              htmlFor={id}
              className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300 ${
                pendente ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {pendente ? <LoaderCircle aria-hidden className="size-[18px] animate-spin" /> : <Camera aria-hidden className="size-[18px]" />}
              {item.situacao === "enviado" ? "Trocar" : "Foto ou PDF"}
            </label>
            <input
              id={id}
              type="file"
              accept={TIPOS_DOCUMENTO}
              multiple
              disabled={pendente}
              onChange={escolher}
              className="sr-only"
            />
            {item.situacao !== "enviado" && (
              <Botao tamanho="sm" variante="fantasma" disabled={pendente} onClick={levar} aria-pressed={item.situacao === "levar"}>
                {item.situacao === "levar" ? "Vou mandar a foto" : "Vou levar no primeiro dia"}
              </Botao>
            )}
          </div>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-body-sm text-danger">
          {erro}
        </p>
      )}
    </li>
  );
}
