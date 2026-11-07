"use client";

import { ArrowLeft, Check, ExternalLink, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarBannerEDestaques, salvarPaginaDeVagas } from "@/lib/acoes/pagina-de-vagas";
import { BENEFICIOS } from "@/lib/constantes";
import { urlDaFoto } from "@/lib/formato";
import { CORES_DA_MARCA, textoSobre, type Marca } from "@/lib/marca";
import { reduzirImagem } from "@/lib/reduzir-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import { Aviso } from "../ui/basicos";
import { Botao, classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

const MAX_TEXTO = 600;
const MAX_FOTOS = 3;
const MAX_DESTAQUES = 3;

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
 * A página de carreiras personalizada (Página de vagas › Página de carreiras): a cor da marca, até 3 fotos (a
 * primeira é a capa), o título, o "Por que trabalhar aqui", até 6 benefícios e o endereço curto. As fotos sobem do
 * navegador para a pasta de quem envia (avatars/<pessoa>/capa/<número>.jpg); o salvar manda tudo de uma vez.
 */
export function FormPaginaDeVagas({
  inicial,
  pessoaId,
  perfilId,
  nome,
  site,
  vagasNoAr = [],
}: {
  inicial: Marca | null;
  pessoaId: string;
  perfilId: string;
  nome: string;
  site: string;
  /** as vagas no ar, para escolher os destaques */
  vagasNoAr?: { id: string; titulo: string; lugar: string }[];
}) {
  const router = useRouter();
  const [cor, setCor] = useState<string | null>(inicial?.cor ?? null);
  const [fotos, setFotos] = useState<string[]>(inicial?.fotos ?? (inicial?.capa ? [inicial.capa] : []));
  const [titulo, setTitulo] = useState(inicial?.titulo ?? "");
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [beneficios, setBeneficios] = useState<string[]>(inicial?.beneficios ?? []);
  const [novo, setNovo] = useState("");
  const [apelido, setApelido] = useState(inicial?.apelido ?? "");
  const [chamada, setChamada] = useState(inicial?.chamada ?? "");
  const [subchamada, setSubchamada] = useState(inicial?.subchamada ?? "");
  // os destaques que ainda estão no ar (os de vagas que saíram ficam de fora)
  const [destaques, setDestaques] = useState<string[]>(
    (inicial?.destaques ?? []).filter((d) => vagasNoAr.some((v) => v.id === d)),
  );
  const [enviando, setEnviando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [retorno, setRetorno] = useState<{ ok: boolean; texto: string } | null>(null);
  const sugestoes = BENEFICIOS.map((b) => b.nome).filter((b) => !beneficios.includes(b));
  const apelidoLimpo = limparApelido(apelido).replace(/^-|-$/g, "");

  /** Sobe as fotos escolhidas (uma ou várias), até completar 3. */
  async function enviarFotos(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(e.target.files ?? [])].filter((a) => a.type.startsWith("image/"));
    e.target.value = "";
    const cabem = arquivos.slice(0, MAX_FOTOS - fotos.length);
    if (!cabem.length) return;
    setEnviando(true);
    setRetorno(null);
    try {
      const novas: string[] = [];
      for (const [i, arquivo] of cabem.entries()) {
        const imagem = await reduzirImagem(arquivo, 1600);
        const caminho = `${pessoaId}/capa/${Date.now() + i}.jpg`;
        const { error } = await criarClienteNavegador()
          .storage.from("avatars")
          .upload(caminho, imagem, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
        if (error) throw error;
        novas.push(caminho);
      }
      setFotos((atuais) => [...atuais, ...novas].slice(0, MAX_FOTOS));
    } catch {
      setRetorno({ ok: false, texto: "Não deu para enviar a foto. Tente outra (até 2 MB depois de reduzida)." });
    } finally {
      setEnviando(false);
    }
  }

  /** Passa a foto para a primeira posição (a capa). */
  function primeira(f: string) {
    setFotos((atuais) => [f, ...atuais.filter((x) => x !== f)]);
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
    let r = await chamarAcao(() =>
      salvarPaginaDeVagas({ cor, titulo, fotos, texto, beneficios, apelido: apelidoLimpo }),
    );
    // o banner e os destaques vão numa função à parte (migração 20270301120000)
    if (r.ok) r = await chamarAcao(() => salvarBannerEDestaques({ chamada, subchamada, destaques }));
    setSalvando(false);
    if (!r.ok && "ir" in r && r.ir) router.push(r.ir);
    setRetorno(r.ok ? { ok: true, texto: r.mensagem ?? "Página salva." } : { ok: false, texto: r.erro });
  }

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
        <h3 className="text-label">Fotos no alto da página</h3>
        <p className="-mt-2 text-body-sm text-ink-muted">
          Até 3: a equipe, a loja, o lugar de trabalho. A primeira fica maior (é a capa); deitadas ficam melhor.
        </p>
        {fotos.length > 0 ? (
          <ul aria-label="Fotos escolhidas" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fotos.map((f, i) => (
              <li key={f} className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a foto acabou de subir para o Storage */}
                <img
                  src={urlDaFoto(f) ?? ""}
                  alt={i === 0 ? "Foto 1 (capa)" : `Foto ${i + 1}`}
                  className="aspect-[3/2] w-full rounded-md border border-line object-cover"
                />
                <div className="flex flex-wrap gap-1">
                  {i > 0 && (
                    <Botao
                      variante="fantasma"
                      tamanho="sm"
                      onClick={() => primeira(f)}
                      aria-label={`Pôr a foto ${i + 1} como capa`}
                    >
                      <ArrowLeft aria-hidden />
                      Capa
                    </Botao>
                  )}
                  <Botao
                    variante="fantasma"
                    tamanho="sm"
                    onClick={() => setFotos((atuais) => atuais.filter((x) => x !== f))}
                    aria-label={`Tirar a foto ${i + 1}`}
                  >
                    <Trash2 aria-hidden />
                    Tirar
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex aspect-[4/1] w-full items-center justify-center rounded-md border border-dashed border-line-strong bg-surface-100 text-body-sm text-ink-muted">
            Sem fotos
          </div>
        )}
        {fotos.length < MAX_FOTOS && (
          <div>
            <label className={`${classesBotao("secundario", "sm")} cursor-pointer has-focus-visible:outline-2`}>
              <ImagePlus aria-hidden />
              {enviando ? "Enviando…" : fotos.length ? "Pôr mais fotos" : "Escolher fotos"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={enviarFotos}
                disabled={enviando}
              />
            </label>
          </div>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-label">Banner no alto</legend>
        <p className="-mt-1 text-body-sm text-ink-muted">
          Uma frase grande por cima das fotos (ou da cor da marca, sem fotos). Com mais de uma foto, elas passam
          sozinhas. Em branco, a página fica sem o banner.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="chamada" className="text-body-sm font-semibold">
            Chamada
          </label>
          <input
            id="chamada"
            value={chamada}
            maxLength={90}
            onChange={(e) => setChamada(e.target.value)}
            placeholder="Construa a sua carreira com a gente!"
            className={classesEntrada}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="subchamada" className="text-body-sm font-semibold">
            Linha de baixo (se quiser)
          </label>
          <input
            id="subchamada"
            value={subchamada}
            maxLength={160}
            onChange={(e) => setSubchamada(e.target.value)}
            placeholder="Vagas perto de casa, com carteira assinada e espaço para crescer."
            className={classesEntrada}
          />
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="titulo-pagina" className="text-label">
          Título
        </label>
        <input
          id="titulo-pagina"
          value={titulo}
          maxLength={80}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Vem construir com a gente!"
          className={classesEntrada}
          aria-describedby="titulo-ajuda"
        />
        <p id="titulo-ajuda" className="text-body-sm text-ink-muted">
          Uma frase sua acima do texto. Em branco, fica “Por que trabalhar aqui”.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="por-que" className="text-label">
          Texto: por que trabalhar aqui
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

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label">Vagas em destaque</legend>
        <p className="text-body-sm text-ink-muted">
          Até {MAX_DESTAQUES}, no alto da página, antes de todas as outras. Quando uma sair do ar, sai do destaque.
        </p>
        {vagasNoAr.length ? (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-md border border-line p-1">
            {vagasNoAr.map((v) => {
              const marcada = destaques.includes(v.id);
              const cheio = !marcada && destaques.length >= MAX_DESTAQUES;
              return (
                <li key={v.id}>
                  <label
                    className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-1.5 ${
                      cheio ? "opacity-50" : "cursor-pointer hover:bg-surface-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      disabled={cheio}
                      onChange={() =>
                        setDestaques((atuais) => (marcada ? atuais.filter((d) => d !== v.id) : [...atuais, v.id]))
                      }
                      className="size-5 shrink-0 accent-[var(--pk-ink)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label">{v.titulo}</span>
                      <span className="block truncate text-body-sm text-ink-muted">{v.lugar}</span>
                    </span>
                    {marcada && (
                      <span className="shrink-0 text-body-sm font-semibold tabular-nums">
                        {destaques.indexOf(v.id) + 1}º
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-body-sm text-ink-muted">Nenhuma vaga no ar agora.</p>
        )}
      </fieldset>

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
