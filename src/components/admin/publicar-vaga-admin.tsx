"use client";

import { Check, ClipboardPaste, Copy, ImageUp, Layers, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ComponentProps } from "react";
import { FormAnuncio, type ValoresAnuncio } from "@/components/form-anuncio";
import { publicarVariasEmNomeDe } from "@/lib/acoes/admin-contas";
import { importarVagas } from "@/lib/acoes/admin-importar";
import type { VagaImportada } from "@/lib/ia/importar-vaga";
import { Aviso, Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// Admin › Publicar vaga em nome de uma conta: antes do formulário, dois atalhos. "Importar com a
// IA" lê a foto de um anúncio (ou o texto colado) e preenche o formulário; com várias vagas na
// mesma foto, elas ficam numa lista (guardada nesta aba do navegador, para publicar uma depois da
// outra). "Copiar uma vaga" traz uma vaga já publicada (desta conta ou de qualquer outra).

export type VagaDaConta = { id: string; titulo: string; situacao: string; bairro: string | null };

type Importacao = { vagas: VagaImportada[]; usadas: number[] };

const LADO_MAXIMO = 1800;
const BYTES_MAXIMOS = 900 * 1024;

/** Diminui a foto no navegador (o servidor aceita até ~1 MB por envio) e manda em JPEG. */
async function encolher(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);
  let lado = LADO_MAXIMO;
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    if (blob && (blob.size <= BYTES_MAXIMOS || tentativa === 3)) {
      return new File([blob], "anuncio.jpg", { type: "image/jpeg" });
    }
    lado = Math.round(lado * 0.75);
  }
  return arquivo;
}

const plural = (n: number) => (n === 1 ? "1 vaga da lista" : `${n} vagas da lista`);

/** A vaga lida pela IA no lugar dos campos do formulário (o lugar da conta fica, se a foto não disser). */
function aplicarImportada(v: VagaImportada, base: ValoresAnuncio, agencia: boolean): ValoresAnuncio {
  return {
    ...base,
    id: undefined,
    tipo: "vaga",
    titulo: v.titulo,
    descricao: v.descricao,
    categoria: v.categoria,
    regime: v.regime,
    pagamento_valor: v.pagamento_valor,
    pagamento_ate: v.pagamento_ate,
    pagamento_unidade: v.pagamento_unidade,
    combinar: v.pagamento_valor == null,
    vagas: v.vagas,
    beneficios: null,
    beneficios_lista: v.beneficios_lista,
    beneficios_extras: v.beneficios_extras,
    escolaridade_minima: v.escolaridade_minima,
    experiencia: v.experiencia,
    cnh: v.cnh,
    jornada: v.jornada,
    horario: null,
    horario_detalhe: v.horario_detalhe,
    bairro: v.bairro ?? base.bairro,
    // outro bairro: o ponto do mapa da conta não vale mais
    ...(v.bairro && v.bairro !== base.bairro ? { lat: null, lng: null, cep: null, endereco: null } : {}),
    contratante: agencia ? (v.contratante ?? base.contratante ?? null) : base.contratante,
  };
}

export function PublicarVagaAdmin({
  contaId,
  inicial,
  copiada,
  vagasDaConta,
  ia,
  ...form
}: {
  contaId: string;
  inicial: ValoresAnuncio;
  /** a vaga copiada (título e de quem), quando o formulário veio preenchido por ela */
  copiada: { titulo: string; de: string } | null;
  vagasDaConta: VagaDaConta[];
  ia: boolean;
} & Omit<ComponentProps<typeof FormAnuncio>, "inicial" | "ia">) {
  const agencia = Boolean(form.agencia);
  const chave = `publike_admin_importadas_${contaId}`;
  const [valores, setValores] = useState(inicial);
  const [versao, setVersao] = useState(0);
  const [importacao, setImportacao] = useState<Importacao | null>(null);
  const [usando, setUsando] = useState<number | null>(null);
  const [lendo, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [foto, setFoto] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const campoFoto = useRef<HTMLInputElement>(null);
  const idTexto = useId();

  // as vagas que sobraram de uma foto com várias (depois de publicar uma, a página volta aqui)
  useEffect(() => {
    try {
      const guardada = window.sessionStorage.getItem(chave);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lido do navegador depois de montar
      if (guardada) setImportacao(JSON.parse(guardada) as Importacao);
    } catch {
      // sem armazenamento: a lista some ao sair da página
    }
  }, [chave]);

  function guardar(i: Importacao | null) {
    setImportacao(i);
    try {
      if (i && i.usadas.length < i.vagas.length) window.sessionStorage.setItem(chave, JSON.stringify(i));
      else window.sessionStorage.removeItem(chave);
    } catch {
      // sem armazenamento: fica só nesta tela
    }
  }

  function escolherFoto(arquivo: File | null | undefined) {
    if (!arquivo || !arquivo.type.startsWith("image/")) return;
    setErro(null);
    setFoto(arquivo);
    setPrevia((antiga) => {
      if (antiga) URL.revokeObjectURL(antiga);
      return URL.createObjectURL(arquivo);
    });
  }

  function usar(i: number, lista: Importacao) {
    setValores(aplicarImportada(lista.vagas[i], inicial, agencia));
    setVersao((n) => n + 1);
    setUsando(i);
    guardar(lista);
    requestAnimationFrame(() => document.getElementById("formulario-vaga")?.scrollIntoView({ behavior: "smooth" }));
  }

  function ler() {
    setErro(null);
    iniciar(async () => {
      const dados = new FormData();
      if (foto) dados.set("imagem", await encolher(foto));
      dados.set("texto", texto);
      const r = await importarVagas(dados);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      const nova = { vagas: r.vagas, usadas: [] };
      guardar(nova);
      if (r.vagas.length === 1) usar(0, nova);
      else setUsando(null);
    });
  }

  const vagaEmUso = importacao && usando !== null ? importacao.vagas[usando] : null;

  // "Publicar todas de uma vez": a do formulário e as que ainda não foram publicadas da lista
  const router = useRouter();
  const [publicando, iniciarTodas] = useTransition();
  const [resultadoTodas, setResultadoTodas] = useState<string | null>(null);
  const faltam =
    importacao && usando !== null
      ? importacao.vagas.map((v, i) => ({ v, i })).filter(({ i }) => i !== usando && !importacao.usadas.includes(i))
      : [];
  const salarios = new Set(importacao?.vagas.map((v) => `${v.pagamento_valor ?? ""}-${v.pagamento_ate ?? ""}`));

  function publicarTodas() {
    const form = document.querySelector<HTMLFormElement>("#formulario-vaga form");
    if (!form || !importacao || usando === null) return;
    setResultadoTodas(null);
    const dados = new FormData(form);
    iniciarTodas(async () => {
      const r = await publicarVariasEmNomeDe(
        contaId,
        dados,
        faltam.map(({ v }) => ({ titulo: v.titulo, descricao: v.descricao, categoria: v.categoria, vagas: v.vagas })),
      );
      if (!r.ok) {
        setResultadoTodas(
          r.campos?.length
            ? `A vaga do formulário não passou: confira ${r.campos.join(", ")}. Dica: clique em “Publicar” no formulário para ver os campos marcados.`
            : r.erro,
        );
        return;
      }
      if (r.falhas.length) {
        // as que deram certo saem da lista; as que falharam ficam para publicar uma a uma
        const falharam = new Set(r.falhas.map((f) => f.titulo));
        const usadas = importacao.vagas
          .map((_, i) => i)
          .filter((i) => !falharam.has(importacao.vagas[i].titulo || "Vaga sem título"));
        guardar({ ...importacao, usadas });
        setUsando(null);
        setResultadoTodas(
          `${r.publicadas} publicadas. Não deu: ${r.falhas.map((f) => `${f.titulo} (${f.erro})`).join("; ")}. Elas ficaram na lista.`,
        );
        return;
      }
      guardar(null);
      router.push(`/admin/usuarios/${contaId}?publicadas=${r.publicadas}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {ia && (
          <section
            aria-labelledby="importar-titulo"
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4"
            // colar um print (Ctrl+V) em qualquer lugar do quadro
            onPaste={(e) => {
              const item = [...e.clipboardData.items].find((x) => x.type.startsWith("image/"));
              if (item) {
                e.preventDefault();
                escolherFoto(item.getAsFile());
              }
            }}
          >
            <h3 id="importar-titulo" className="flex items-center gap-2 text-h3">
              <Sparkles aria-hidden className="size-5 text-terra-text" />
              Importar com a IA
            </h3>
            <p className="text-body-sm text-ink-muted">
              Foto do cartaz, post do Instagram ou print do WhatsApp (ou cole o texto). A IA preenche o formulário; você
              confere e publica.
            </p>
            <input
              ref={campoFoto}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Foto do anúncio"
              onChange={(e) => escolherFoto(e.target.files?.[0])}
            />
            {previa ? (
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) */}
                <img
                  src={previa}
                  alt="Foto escolhida"
                  className="max-h-40 rounded-md border border-line object-contain"
                />
                <Botao
                  tamanho="sm"
                  variante="fantasma"
                  onClick={() => {
                    setFoto(null);
                    setPrevia(null);
                    if (campoFoto.current) campoFoto.current.value = "";
                  }}
                >
                  <X aria-hidden />
                  Tirar a foto
                </Botao>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => campoFoto.current?.click()}
                className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong px-4 text-label text-ink-muted hover:border-ink hover:text-ink"
              >
                <ImageUp aria-hidden className="size-6" />
                Escolher a foto
                <span className="text-body-sm font-normal">ou cole um print aqui (Ctrl+V)</span>
              </button>
            )}
            <label htmlFor={idTexto} className="flex items-center gap-1.5 text-label">
              <ClipboardPaste aria-hidden className="size-4 text-ink-muted" />
              Texto do anúncio <span className="font-normal text-ink-muted">(opcional)</span>
            </label>
            <textarea
              id={idTexto}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              maxLength={6000}
              placeholder="Cole aqui a mensagem do WhatsApp ou a legenda do post"
              className={classesEntrada}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Botao variante="primario" onClick={ler} disabled={lendo || (!foto && texto.trim().length < 20)}>
                <Sparkles aria-hidden />
                {lendo ? "Lendo… (até 1 minuto)" : "Ler com a IA"}
              </Botao>
            </div>
            {erro && (
              <p role="alert" className="text-body-sm text-danger">
                {erro}
              </p>
            )}
          </section>
        )}

        <section
          aria-labelledby="copiar-titulo"
          className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4"
        >
          <h3 id="copiar-titulo" className="flex items-center gap-2 text-h3">
            <Copy aria-hidden className="size-5 text-terra-text" />
            Copiar uma vaga
          </h3>
          {vagasDaConta.length > 0 ? (
            <ul aria-label="Vagas desta conta" className="flex flex-col divide-y divide-line">
              {vagasDaConta.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-label">{v.titulo}</span>
                    <span className="block text-body-sm text-ink-muted">
                      {v.situacao}
                      {v.bairro ? ` · ${v.bairro}` : ""}
                    </span>
                  </span>
                  <Link
                    href={`/admin/usuarios/${contaId}/publicar?copiar=${v.id}#formulario-vaga`}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-line-strong px-3 text-label hover:bg-surface-300"
                  >
                    <Copy aria-hidden className="size-4" />
                    Copiar
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-body-sm text-ink-muted">Esta conta ainda não tem vaga publicada.</p>
          )}
          <form action={`/admin/usuarios/${contaId}/publicar`} className="flex flex-col gap-2">
            <label htmlFor="copiar-link" className="text-label">
              Ou cole o link de qualquer vaga do Publike
            </label>
            <div className="flex gap-2">
              <input
                id="copiar-link"
                name="copiar"
                required
                placeholder="https://publike.com.br/anuncio/…"
                className={classesEntrada}
              />
              <Botao type="submit">Copiar</Botao>
            </div>
          </form>
        </section>
      </div>

      {importacao && importacao.vagas.length > 1 && (
        <section aria-labelledby="importadas-titulo" className="flex flex-col gap-3 rounded-lg border border-line p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="importadas-titulo" className="text-h3">
              {importacao.vagas.length} vagas no anúncio
            </h3>
            <Botao tamanho="sm" variante="fantasma" onClick={() => guardar(null)}>
              Limpar a lista
            </Botao>
          </div>
          <p className="text-body-sm text-ink-muted">
            Escolha uma, confira e publique. Depois de publicar, volte em “Publicar vaga” para a próxima: a lista fica
            guardada nesta aba.
          </p>
          <ul className="flex flex-col gap-2">
            {importacao.vagas.map((v, i) => {
              const usada = importacao.usadas.includes(i);
              return (
                <li
                  key={i}
                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${usando === i ? "border-ink" : "border-line"}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-label">{v.titulo || "Vaga sem título"}</span>
                    <span className="block text-body-sm text-ink-muted">
                      {v.vagas > 1 ? `${v.vagas} vagas · ` : ""}
                      {v.pagamento_valor
                        ? v.pagamento_valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "salário a combinar"}
                      {usada && usando !== i ? " · já publicada" : ""}
                    </span>
                  </span>
                  {usando === i ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-label text-cerrado-text">
                      <Check aria-hidden className="size-4" />
                      No formulário
                    </span>
                  ) : (
                    <Botao tamanho="sm" onClick={() => usar(i, importacao)}>
                      Usar esta
                    </Botao>
                  )}
                </li>
              );
            })}
          </ul>
          {faltam.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-md border-2 border-terra bg-terra-soft p-3">
              <p className="flex flex-wrap items-center gap-2 text-label">
                <Selo variante="novo">Novo</Selo>
                Publicar todas de uma vez
              </p>
              <p className="text-body-sm">
                Sai a vaga do formulário e mais {plural(faltam.length)}. O salário, os benefícios, o horário, o endereço
                e o contato do formulário valem para todas; de cada uma mudam o título, a descrição, a categoria e
                quantas pessoas.
              </p>
              {salarios.size > 1 && (
                <p className="text-body-sm text-terra-text">
                  Atenção: a IA leu salários diferentes entre as vagas. Todas vão sair com o salário do formulário.
                </p>
              )}
              <div>
                <Botao variante="primario" onClick={publicarTodas} disabled={publicando}>
                  <Layers aria-hidden />
                  {publicando ? "Publicando…" : `Publicar as ${faltam.length + 1} vagas`}
                </Botao>
              </div>
              {resultadoTodas && (
                <p role="alert" className="text-body-sm text-danger">
                  {resultadoTodas}
                </p>
              )}
            </div>
          ) : (
            usando === null &&
            importacao.usadas.length < importacao.vagas.length && (
              <p className="text-body-sm text-ink-muted">
                Para publicar todas de uma vez: clique em “Usar esta” na primeira, confira o formulário (endereço,
                salário, horário) e volte aqui.
              </p>
            )
          )}
        </section>
      )}

      <div
        id="formulario-vaga"
        className="flex scroll-mt-24 flex-col gap-4"
        // ao mandar publicar, a vaga da foto conta como usada (a lista guarda as que faltam)
        onSubmitCapture={() => {
          if (importacao && usando !== null && !importacao.usadas.includes(usando)) {
            const nova = { ...importacao, usadas: [...importacao.usadas, usando] };
            // depois do envio: mexer na tela no meio dele redesenharia o formulário antes de ler os campos
            window.setTimeout(() => guardar(nova), 0);
          }
        }}
      >
        {vagaEmUso ? (
          <Aviso tipo="info" titulo="Preenchido pela IA: confira antes de publicar">
            {vagaEmUso.conferir.length > 0 ? (
              <ul className="mt-1 list-disc pl-5">
                {vagaEmUso.conferir.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              "Confira o título, o salário, o bairro e a categoria."
            )}
          </Aviso>
        ) : (
          copiada && (
            <Aviso tipo="info" titulo={`Copiada de “${copiada.titulo}”`}>
              De {copiada.de}. Mude o que precisar (o bairro, o salário, quantas vagas) e publique: sai uma vaga nova.
            </Aviso>
          )
        )}
        <FormAnuncio key={versao} inicial={valores} ia={ia} {...form} />
      </div>
    </div>
  );
}
