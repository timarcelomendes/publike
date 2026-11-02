"use client";

import { Check, ExternalLink, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarPaginaDeVagas } from "@/lib/acoes/pagina-de-vagas";
import { BENEFICIOS } from "@/lib/constantes";
import { urlDaFoto } from "@/lib/formato";
import { CORES_DA_MARCA, textoSobre, type Marca } from "@/lib/marca";
import { reduzirImagem } from "@/lib/reduzir-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Aviso } from "../ui/basicos";
import { Botao, classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

const MAX_TEXTO = 600;

/** "Crescere Gestão" → "crescere-gestao": o apelido sugerido, sem acento, minúsculo, com hífen. */
function limparApelido(t: string) {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .slice(0, 30);
}

/**
 * A página de carreiras personalizada (Links para divulgar › Página de carreiras): a cor da marca, a capa, o "Por
 * que trabalhar aqui", até 6 benefícios e o endereço curto. A capa sobe do navegador para a pasta de quem envia
 * (avatars/<pessoa>/capa/<número>.jpg); o salvar manda tudo de uma vez.
 */
export function FormPaginaDeVagas({
  inicial,
  pessoaId,
  perfilId,
  nome,
  site,
}: {
  inicial: Marca | null;
  pessoaId: string;
  perfilId: string;
  nome: string;
  site: string;
}) {
  const router = useRouter();
  const [cor, setCor] = useState<string | null>(inicial?.cor ?? null);
  const [capa, setCapa] = useState<string | null>(inicial?.capa ?? null);
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [beneficios, setBeneficios] = useState<string[]>(inicial?.beneficios ?? []);
  const [novo, setNovo] = useState("");
  const [apelido, setApelido] = useState(inicial?.apelido ?? "");
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null);
  const sugestoes = BENEFICIOS.map((b) => b.nome).filter((b) => !beneficios.includes(b));
  const apelidoLimpo = limparApelido(apelido).replace(/^-|-$/g, "");

  async function enviarCapa(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo || !arquivo.type.startsWith("image/")) return;
    setEnviando(true);
    setRetorno(null);
    try {
      const imagem = await reduzirImagem(arquivo, 1600);
      const caminho = `${pessoaId}/capa/${Date.now()}.jpg`;
      const { error } = await criarClienteNavegador()
        .storage.from("avatars")
        .upload(caminho, imagem, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      if (error) throw error;
      setCapa(caminho);
    } catch {
      setRetorno({ ok: false, texto: "Não deu para enviar a capa. Tente outra foto (até 2 MB depois de reduzida)." });
    } finally {
      setEnviando(false);
    }
  }

  function incluir(b: string) {
    const limpo = b.trim().slice(0, 60);
    if (!limpo || beneficios.includes(limpo) || beneficios.length >= 6) return;
    setBeneficios([...beneficios, limpo]);
    setNovo("");
  }

  async function salvar() {
    setSalvando(true);
    setRetorno(null);
    const r = await chamarAcao(() => salvarPaginaDeVagas({ cor, capa, texto, beneficios, apelido: apelidoLimpo }));
    setSalvando(false);
    if (!r.ok && "ir" in r && r.ir) router.push(r.ir);
    setRetorno(r.ok ? { ok: true, texto: r.mensagem ?? "Página salva." } : { ok: false, texto: r.erro });
  }

  const urlCapa = urlDaFoto(capa);
  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-label">Cor da marca</legend>
        <p className="-mt-1 text-body-sm text-ink-muted">
          A que fica mais perto da sua logo. Aparece no alto da página, no quadro do site, nas imagens e no cartaz.
        </p>
        <div className="flex flex-wrap gap-2">
          <label
            className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-pill border px-3 text-body-sm has-focus-visible:outline-2 ${
              cor === null ? "border-ink" : "border-line"
            }`}
          >
            <input type="radio" name="cor" className="sr-only" checked={cor === null} onChange={() => setCor(null)} />
            <span aria-hidden className="size-5 rounded-pill border border-line bg-surface-300" />A do Publike
          </label>
          {CORES_DA_MARCA.map((c) => (
            <label
              key={c.hex}
              title={c.nome}
              className={`inline-flex size-11 cursor-pointer items-center justify-center rounded-pill border-2 has-focus-visible:outline-2 ${
                cor === c.hex ? "border-ink" : "border-transparent"
              }`}
            >
              <input
                type="radio"
                name="cor"
                className="sr-only"
                checked={cor === c.hex}
                onChange={() => setCor(c.hex)}
                aria-label={c.nome}
              />
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-pill"
                style={{ background: c.hex, color: textoSobre(c.hex) }}
              >
                {cor === c.hex && <Check className="size-4" />}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <h3 className="text-label">Capa</h3>
        <p className="-mt-2 text-body-sm text-ink-muted">
          Uma foto da equipe, da loja ou do lugar de trabalho. Fica larga no alto da página (bem vinda na horizontal).
        </p>
        {urlCapa ? (
          // eslint-disable-next-line @next/next/no-img-element -- a capa acabou de subir para o Storage
          <img
            src={urlCapa}
            alt="A capa escolhida"
            className="aspect-[4/1] w-full rounded-md border border-line object-cover"
          />
        ) : (
          <div className="flex aspect-[4/1] w-full items-center justify-center rounded-md border border-dashed border-line-strong bg-surface-100 text-body-sm text-ink-muted">
            Sem capa
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <label className={`${classesBotao("secundario", "sm")} cursor-pointer has-focus-visible:outline-2`}>
            <ImagePlus aria-hidden />
            {enviando ? "Enviando…" : urlCapa ? "Trocar a capa" : "Escolher a capa"}
            <input type="file" accept="image/*" className="sr-only" onChange={enviarCapa} disabled={enviando} />
          </label>
          {urlCapa && (
            <Botao variante="fantasma" tamanho="sm" onClick={() => setCapa(null)}>
              <Trash2 aria-hidden />
              Tirar a capa
            </Botao>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="por-que" className="text-label">
          Por que trabalhar aqui
        </label>
        <textarea
          id="por-que"
          rows={5}
          maxLength={MAX_TEXTO}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`O que faz de ${nome} um bom lugar para trabalhar: o time, o jeito de trabalhar, onde dá para crescer.`}
          className={`${classesEntrada} resize-y text-body`}
          aria-describedby="por-que-conta"
        />
        <p id="por-que-conta" className="self-end text-body-sm text-ink-muted tabular-nums">
          {texto.length} de {MAX_TEXTO}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label">Benefícios em destaque</h3>
        <p className="-mt-1 text-body-sm text-ink-muted">Até 6, os que valem para todas as vagas.</p>
        {beneficios.length > 0 && (
          <ul aria-label="Benefícios escolhidos" className="flex flex-wrap gap-2">
            {beneficios.map((b) => (
              <li
                key={b}
                className="inline-flex min-h-10 items-center gap-1 rounded-pill bg-surface-300 pr-1 pl-3 text-label"
              >
                {b}
                <button
                  type="button"
                  onClick={() => setBeneficios(beneficios.filter((x) => x !== b))}
                  className="inline-flex size-8 items-center justify-center rounded-pill hover:bg-surface-200"
                  aria-label={`Tirar ${b}`}
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {beneficios.length < 6 && (
          <>
            <div className="flex gap-2">
              <label htmlFor="beneficio-novo" className="sr-only">
                Outro benefício
              </label>
              <input
                id="beneficio-novo"
                value={novo}
                maxLength={60}
                onChange={(e) => setNovo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    incluir(novo);
                  }
                }}
                placeholder="Escreva um benefício"
                className={`${classesEntrada} min-w-0 flex-1`}
              />
              <Botao variante="secundario" tamanho="sm" onClick={() => incluir(novo)} disabled={!novo.trim()}>
                <Plus aria-hidden />
                Pôr
              </Botao>
            </div>
            <div className="flex flex-wrap gap-1.5" aria-label="Sugestões">
              {sugestoes.slice(0, 10).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => incluir(b)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-pill border border-line px-3 text-body-sm hover:bg-surface-300"
                >
                  <Plus aria-hidden className="size-3.5" />
                  {b}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="apelido" className="text-label">
          Endereço curto
        </label>
        <div className={`${classesEntrada} flex items-center gap-0 p-0`}>
          <span className="pl-3 text-body-sm whitespace-nowrap text-ink-muted">
            {site.replace(/^https?:\/\//, "")}/v/
          </span>
          <input
            id="apelido"
            value={apelido}
            maxLength={30}
            onChange={(e) => setApelido(limparApelido(e.target.value))}
            placeholder={limparApelido(nome.split(/\s+/)[0] ?? "")}
            className="min-h-11 min-w-0 flex-1 bg-transparent pr-3 outline-none"
            aria-describedby="apelido-ajuda"
          />
        </div>
        <p id="apelido-ajuda" className="text-body-sm text-ink-muted">
          De 3 a 30 letras sem acento, números e hífen. Para pôr na bio, no cartão de visita e no cartaz.
        </p>
      </div>

      {retorno && (
        <Aviso tipo={retorno.ok ? "sucesso" : "erro"}>
          <p>{retorno.texto}</p>
        </Aviso>
      )}
      <div className="flex flex-wrap gap-2">
        <Botao variante="primario" onClick={salvar} disabled={salvando || enviando}>
          <Check aria-hidden />
          {salvando ? "Salvando…" : "Salvar a página"}
        </Botao>
        <a href={`/perfil/${perfilId}/vagas`} target="_blank" rel="noopener" className={classesBotao("secundario")}>
          <ExternalLink aria-hidden />
          Ver a página
        </a>
      </div>
    </div>
  );
}
