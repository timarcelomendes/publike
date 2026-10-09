"use client";

import { Camera, Check, Info, Plus, Search, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from "react";
import { salvarServicos } from "@/lib/acoes/servicos";
import { BAIRROS } from "@/lib/bairros";
import {
  AREAS_GOIANIA,
  CATEGORIAS,
  CIDADES,
  MAX_FOTOS,
  MAX_SERVICOS,
  OFICIOS,
  REGIOES,
  STATUS_ANUNCIO,
  UNIDADES,
  UNIDADES_SERVICO,
  oficio as acharOficio,
  type Cidade,
} from "@/lib/constantes";
import { urlDaFotoTrabalho } from "@/lib/formato";
import { criarClienteNavegador } from "@/lib/supabase/navegador";
import type { EstadoForm, StatusAnuncio } from "@/lib/tipos";
import { SeletorLocal } from "./mapa/seletor-local";
import { Aviso, Selo } from "./ui/basicos";
import { Botao } from "./ui/botao";
import { classesEntrada, MensagemErro, Seletor } from "./ui/campo";

export type ServicoInicial = {
  id: string;
  oficio: string | null;
  categoria: string;
  titulo: string;
  descricao: string;
  pagamento_valor: number | null;
  pagamento_unidade: string | null;
  fotos: string[];
  status: string;
};

export type ValoresServicos = {
  servicos: ServicoInicial[];
  cidade: string;
  bairro: string;
  lat: number | null;
  lng: number | null;
  atende: string[];
  horario: string | null;
};

type Item = {
  /** chave só da tela (serviço novo ainda não tem id) */
  chave: string;
  id: string | null;
  oficio: string | null;
  categoria: string;
  titulo: string;
  descricao: string;
  combinar: boolean;
  valor: string;
  unidade: string;
  fotos: string[];
  status: string | null;
};

const ESTADO_INICIAL: EstadoForm = { ok: false };

/** Os serviços que aparecem primeiro (o resto fica em "Ver todos" e na busca). */
const MAIS_COMUNS = [
  "pedreiro",
  "pintor",
  "eletricista",
  "encanador",
  "marido-de-aluguel",
  "montador-de-moveis",
  "diarista",
  "passadeira",
  "baba",
  "cuidador",
  "manicure",
  "cabeleireiro",
  "frete",
  "jardineiro",
  "mecanico",
  "aulas",
] as const;

/** Com a moderação, o serviço não pode ser alterado: aparece só para consulta. */
const comModeracao = (status: string | null) => status === "em_analise" || status === "removido";

let contador = 0;
function novaChave() {
  contador += 1;
  return `novo-${contador}`;
}

function itemDe(s: ServicoInicial): Item {
  return {
    chave: s.id,
    id: s.id,
    oficio: s.oficio,
    categoria: s.categoria,
    titulo: s.titulo,
    descricao: s.descricao,
    combinar: s.pagamento_valor == null,
    valor: s.pagamento_valor != null ? String(s.pagamento_valor).replace(".", ",") : "",
    unidade: s.pagamento_unidade ?? "dia",
    fotos: s.fotos,
    status: s.status,
  };
}

/** Reduz a foto (lado maior com até 1280 px, JPEG), para ficar leve no celular. */
async function reduzirFoto(arquivo: File, maior = 1280): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, maior / Math.max(imagem.width, imagem.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(imagem.width * escala);
  tela.height = Math.round(imagem.height * escala);
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(imagem, 0, 0, tela.width, tela.height);
  return new Promise((resolver, rejeitar) =>
    tela.toBlob((b) => (b ? resolver(b) : rejeitar(new Error("blob"))), "image/jpeg", 0.82),
  );
}

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function Secao({
  numero,
  titulo,
  descricao,
  children,
}: {
  numero: number;
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
      <div>
        <h2 className="flex items-center gap-3 text-h3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-label">
            {numero}
          </span>
          {titulo}
        </h2>
        {descricao && <p className="mt-2 text-body-sm text-ink-muted">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

const chip = (ativo: boolean) =>
  `inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
    ativo ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-300 text-ink hover:border-line-strong"
  }`;

export function FormServicos({
  inicial,
  usuarioId,
  demo = false,
}: {
  inicial: ValoresServicos;
  usuarioId: string;
  /** Modo demonstração: dá para ver o formulário, mas não envia fotos nem salva. */
  demo?: boolean;
}) {
  const [estado, acao, enviando] = useActionState(salvarServicos, ESTADO_INICIAL);
  const [itens, setItens] = useState<Item[]>(() => inicial.servicos.map(itemDe));
  const [busca, setBusca] = useState("");
  const [todos, setTodos] = useState(false);
  const [cidade, setCidade] = useState(inicial.cidade);
  const [atende, setAtende] = useState<Set<string>>(() => new Set(inicial.atende));
  const formulario = useRef<HTMLFormElement>(null);
  const erros = estado.erros ?? {};

  const editaveis = itens.filter((i) => !comModeracao(i.status));
  const cheio = editaveis.length >= MAX_SERVICOS;

  // Depois de um erro, leva a pessoa até o primeiro campo com problema
  useEffect(() => {
    if (!estado.erros) return;
    formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [estado]);

  function mudar(chave: string, mudancas: Partial<Item>) {
    setItens((lista) => lista.map((i) => (i.chave === chave ? { ...i, ...mudancas } : i)));
  }

  function adicionar(slug: string | null) {
    if (cheio) return;
    const o = acharOficio(slug);
    const ja = slug ? itens.find((i) => i.oficio === slug) : null;
    if (ja) {
      document.getElementById(`servico-${ja.chave}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const chave = novaChave();
    setItens((lista) => [
      ...lista,
      {
        chave,
        id: null,
        oficio: o?.slug ?? null,
        categoria: o?.categoria ?? "",
        titulo: o?.nome ?? "",
        descricao: "",
        combinar: false,
        valor: "",
        unidade: "dia",
        fotos: [],
        status: null,
      },
    ]);
    // espera o bloco aparecer para levar a pessoa até ele
    setTimeout(() => {
      const bloco = document.getElementById(`servico-${chave}`);
      bloco?.scrollIntoView({ behavior: "smooth", block: "start" });
      bloco?.querySelector<HTMLElement>(o ? "textarea" : "input")?.focus({ preventScroll: true });
    }, 50);
  }

  function remover(chave: string) {
    setItens((lista) => lista.filter((i) => i.chave !== chave));
  }

  function marcarArea(area: string, marcado: boolean) {
    setAtende((atual) => {
      const novo = new Set(atual);
      if (area === "Goiânia") {
        // Goiânia inteira cobre as regiões
        for (const r of AREAS_GOIANIA) novo.delete(r);
      }
      if (marcado) novo.add(area);
      else novo.delete(area);
      return novo;
    });
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    dados.set(
      "servicos",
      JSON.stringify(
        editaveis.map((i) => ({
          id: i.id,
          oficio: i.oficio,
          categoria: i.categoria,
          titulo: i.titulo,
          descricao: i.descricao,
          combinar: i.combinar,
          valor: i.valor,
          unidade: i.unidade,
          fotos: i.fotos,
        })),
      ),
    );
    startTransition(() => acao(dados));
  }

  const termo = semAcento(busca.trim());
  // sem busca, mostra os mais procurados (e os já escolhidos); "Ver todos" abre a lista inteira
  const oficiosVisiveis = termo
    ? OFICIOS.filter((o) => semAcento(o.nome).includes(termo))
    : todos
      ? OFICIOS
      : OFICIOS.filter((o) => (MAIS_COMUNS as readonly string[]).includes(o.slug) || itens.some((i) => i.oficio === o.slug));
  const goianiaInteira = atende.has("Goiânia");

  // erros de cada serviço chegam como "servicos.0.descricao", na ordem dos editáveis
  const errosDe = (chave: string) => {
    const indice = editaveis.findIndex((i) => i.chave === chave);
    const prefixo = `servicos.${indice}.`;
    const lista: Record<string, string> = {};
    for (const [k, v] of Object.entries(erros))
      if (indice >= 0 && k.startsWith(prefixo)) lista[k.slice(prefixo.length)] = v;
    return lista;
  };

  return (
    <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
      <Secao
        numero={1}
        titulo="O que você faz?"
        descricao={`Escolha os serviços que você oferece (até ${MAX_SERVICOS}). Cada um aparece separado na busca, com a sua descrição, o preço e as fotos.`}
      >
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
          />
          <label htmlFor="procurar-servico" className="sr-only">
            Procurar serviço
          </label>
          <input
            id="procurar-servico"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Procurar: pedreiro, diarista, manicure…"
            className={`${classesEntrada} pl-9`}
          />
        </div>
        <div role="group" aria-label="Serviços" className="flex flex-wrap gap-2">
          {oficiosVisiveis.map((o) => {
            const escolhido = itens.some((i) => i.oficio === o.slug);
            return (
              <button
                key={o.slug}
                type="button"
                aria-pressed={escolhido}
                disabled={!escolhido && cheio}
                onClick={() => adicionar(o.slug)}
                className={`${chip(escolhido)} disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {escolhido ? <Check aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
                {o.nome}
              </button>
            );
          })}
          {!termo && !todos && (
            <button
              type="button"
              onClick={() => setTodos(true)}
              className="inline-flex min-h-10 items-center rounded-pill px-3.5 text-label text-terra-text underline underline-offset-2 hover:bg-surface-300"
            >
              Ver todos ({OFICIOS.length})
            </button>
          )}
          <button
            type="button"
            disabled={cheio}
            onClick={() => adicionar(null)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-pill border border-dashed border-line-strong px-3.5 text-label text-ink transition-colors hover:bg-surface-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus aria-hidden className="size-4" />
            Outro serviço
          </button>
        </div>
        {cheio && (
          <p className="text-body-sm text-ink-muted">
            Você chegou a {MAX_SERVICOS} serviços. Tire algum para pôr outro.
          </p>
        )}
        {erros.servicos && <MensagemErro>{erros.servicos}</MensagemErro>}
      </Secao>

      {itens.map((item) => (
        <BlocoServico
          key={item.chave}
          item={item}
          erros={errosDe(item.chave)}
          usuarioId={usuarioId}
          demo={demo}
          mudar={(m) => mudar(item.chave, m)}
          remover={() => remover(item.chave)}
        />
      ))}

      <Secao
        numero={2}
        titulo="Onde você fica"
        descricao="Serve para calcular a distância de quem procura. Mostramos só uma área de uns 500 metros, nunca o endereço."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="cidade" className="text-label">
              Cidade
            </label>
            <Seletor
              id="cidade"
              name="cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              aria-invalid={erros.cidade ? true : undefined}
              className={classesEntrada}
            >
              {CIDADES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Seletor>
            {erros.cidade && <MensagemErro>{erros.cidade}</MensagemErro>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="bairro" className="text-label">
              Bairro ou setor
            </label>
            <input
              id="bairro"
              name="bairro"
              defaultValue={inicial.bairro}
              list="bairros-servicos"
              maxLength={80}
              autoComplete="off"
              placeholder="Ex.: Setor Bueno"
              aria-invalid={erros.bairro ? true : undefined}
              className={classesEntrada}
            />
            <datalist id="bairros-servicos">
              {(BAIRROS[cidade as Cidade] ?? []).map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            {erros.bairro && <MensagemErro>{erros.bairro}</MensagemErro>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-label">Marque a sua região no mapa</p>
          <SeletorLocal
            inicial={inicial.lat != null && inicial.lng != null ? { lat: inicial.lat, lng: inicial.lng } : null}
            erro={erros.lat ?? erros.lng}
          />
          {(erros.lat || erros.lng) && <MensagemErro>{erros.lat ?? erros.lng}</MensagemErro>}
        </div>
      </Secao>

      <Secao
        numero={3}
        titulo="Onde você atende"
        descricao="Quem mora nesses lugares vê seus serviços primeiro, mesmo que esteja longe de onde você fica."
      >
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-label">Goiânia</legend>
          <div className="flex flex-wrap gap-2">
            <label
              className={`${chip(goianiaInteira)} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus`}
            >
              <input
                type="checkbox"
                name="atende"
                value="Goiânia"
                checked={goianiaInteira}
                onChange={(e) => marcarArea("Goiânia", e.target.checked)}
                className="sr-only"
              />
              {goianiaInteira && <Check aria-hidden className="size-4" />}
              Goiânia inteira
            </label>
            {REGIOES.map((r) => {
              const area = `Goiânia: ${r}`;
              const marcado = goianiaInteira || atende.has(area);
              return (
                <label
                  key={r}
                  className={`${chip(marcado)} ${goianiaInteira ? "opacity-60" : "cursor-pointer"} has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus`}
                >
                  <input
                    type="checkbox"
                    name={goianiaInteira ? undefined : "atende"}
                    value={area}
                    checked={marcado}
                    disabled={goianiaInteira}
                    onChange={(e) => marcarArea(area, e.target.checked)}
                    className="sr-only"
                  />
                  {marcado && <Check aria-hidden className="size-4" />}
                  Região {r}
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-label">Outras cidades</legend>
          <div className="flex flex-wrap gap-2">
            {CIDADES.filter((c) => c !== "Goiânia").map((c) => {
              const marcado = atende.has(c);
              return (
                <label
                  key={c}
                  className={`${chip(marcado)} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus`}
                >
                  <input
                    type="checkbox"
                    name="atende"
                    value={c}
                    checked={marcado}
                    onChange={(e) => marcarArea(c, e.target.checked)}
                    className="sr-only"
                  />
                  {marcado && <Check aria-hidden className="size-4" />}
                  {c}
                </label>
              );
            })}
          </div>
        </fieldset>
        {erros.atende && <MensagemErro>{erros.atende}</MensagemErro>}
      </Secao>

      <Secao numero={4} titulo="Quando você atende">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="horario" className="text-label">
            Dias e horários <span className="font-normal text-ink-muted">(opcional)</span>
          </label>
          <input
            id="horario"
            name="horario"
            defaultValue={inicial.horario ?? ""}
            maxLength={120}
            placeholder="Ex.: Seg a sáb, das 7h às 17h"
            aria-invalid={erros.horario ? true : undefined}
            className={classesEntrada}
          />
          {erros.horario && <MensagemErro>{erros.horario}</MensagemErro>}
        </div>
      </Secao>

      {estado.erro && <Aviso tipo="erro">{estado.erro}</Aviso>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Botao type="submit" variante="primario" disabled={enviando || editaveis.length === 0} className="sm:min-w-56">
          {enviando ? "Salvando…" : "Salvar meus serviços"}
        </Botao>
        <p className="text-body-sm text-ink-muted">
          Grátis. Seus serviços ficam 90 dias no ar, e salvar de novo renova o prazo. Ao salvar, você concorda com as{" "}
          <Link href="/privacidade#regras" className="underline">
            regras do Publike
          </Link>
          .
        </p>
      </div>
    </form>
  );
}

function BlocoServico({
  item,
  erros,
  usuarioId,
  demo,
  mudar,
  remover,
}: {
  item: Item;
  erros: Record<string, string>;
  usuarioId: string;
  demo: boolean;
  mudar: (m: Partial<Item>) => void;
  remover: () => void;
}) {
  const [enviandoFotos, setEnviandoFotos] = useState(0);
  const [erroFoto, setErroFoto] = useState<string | null>(null);
  const seletorFotos = useRef<HTMLInputElement>(null);
  const travado = comModeracao(item.status);
  const o = acharOficio(item.oficio);
  const id = (campo: string) => `s-${item.chave}-${campo}`;
  const status = item.status as StatusAnuncio | null;
  const cabem = MAX_FOTOS - item.fotos.length;

  async function escolherFotos(e: ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith("image/"));
    e.target.value = "";
    if (!arquivos.length) return;
    setErroFoto(null);
    const escolhidas = arquivos.slice(0, cabem);
    if (arquivos.length > cabem) setErroFoto(`Cabem só mais ${cabem} ${cabem === 1 ? "foto" : "fotos"} neste serviço.`);
    setEnviandoFotos(escolhidas.length);
    const supabase = criarClienteNavegador();
    const novas: string[] = [];
    for (const arquivo of escolhidas) {
      try {
        const imagem = await reduzirFoto(arquivo);
        const sorteio = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
        const caminho = `${usuarioId}/${Date.now()}${sorteio}.jpg`;
        const { error } = await supabase.storage
          .from("trabalhos")
          .upload(caminho, imagem, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
        if (error) throw error;
        novas.push(caminho);
      } catch {
        setErroFoto("Uma das fotos não foi enviada. Tente de novo.");
      }
      setEnviandoFotos((n) => Math.max(0, n - 1));
    }
    if (novas.length) mudar({ fotos: [...item.fotos, ...novas].slice(0, MAX_FOTOS) });
  }

  return (
    <section
      id={`servico-${item.chave}`}
      className="flex scroll-mt-24 flex-col gap-5 rounded-lg border border-line-strong bg-surface-200 p-5 shadow-card sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption text-ink-muted uppercase">Serviço</p>
          <h3 className="text-h3">{o?.nome ?? (item.titulo || "Outro serviço")}</h3>
          {status && (
            <div className="mt-2">
              <Selo variante={status === "ativo" ? "match" : travado ? "perigo" : "contorno"}>
                {STATUS_ANUNCIO[status]?.nome ?? status}
              </Selo>
            </div>
          )}
        </div>
        {!travado && (
          <Botao tamanho="sm" variante="fantasma" onClick={remover}>
            <Trash2 aria-hidden />
            Tirar
          </Botao>
        )}
      </div>

      {travado ? (
        <Aviso tipo="alerta" titulo="Este serviço está com a moderação">
          Ele não pode ser alterado agora. Você recebe um aviso quando a análise terminar.
        </Aviso>
      ) : (
        <>
          {item.id && item.status !== "ativo" && (
            <p className="text-body-sm text-ink-muted">
              {item.status === "expirado"
                ? "Venceu. Ao salvar, ele volta ao ar por mais 90 dias."
                : "Pausado: continua fora da busca até você reativar no painel."}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("titulo")} className="text-label">
              Nome do serviço
            </label>
            <input
              id={id("titulo")}
              value={item.titulo}
              onChange={(e) => mudar({ titulo: e.target.value })}
              maxLength={90}
              placeholder={o ? `Ex.: ${o.nome}: o que você faz de melhor` : "Ex.: Conserto de bicicleta"}
              aria-invalid={erros.titulo ? true : undefined}
              aria-describedby={id("titulo-ajuda")}
              className={classesEntrada}
            />
            {erros.titulo ? (
              <MensagemErro>{erros.titulo}</MensagemErro>
            ) : (
              <p id={id("titulo-ajuda")} className="text-body-sm text-ink-muted">
                É o título do cartão na busca. Dá para detalhar: “Pedreiro: reboco e contrapiso”.
              </p>
            )}
          </div>

          {!o && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor={id("categoria")} className="text-label">
                Categoria
              </label>
              <Seletor
                id={id("categoria")}
                value={item.categoria}
                onChange={(e) => mudar({ categoria: e.target.value })}
                aria-invalid={erros.categoria ? true : undefined}
                className={classesEntrada}
              >
                <option value="" disabled>
                  Escolha uma categoria
                </option>
                {CATEGORIAS.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.nome}
                  </option>
                ))}
              </Seletor>
              {erros.categoria && <MensagemErro>{erros.categoria}</MensagemErro>}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor={id("descricao")} className="text-label">
              Descrição
            </label>
            <textarea
              id={id("descricao")}
              value={item.descricao}
              onChange={(e) => mudar({ descricao: e.target.value })}
              rows={5}
              maxLength={3000}
              aria-invalid={erros.descricao ? true : undefined}
              aria-describedby={id("descricao-ajuda")}
              placeholder="O que você faz, há quanto tempo, o que está incluído e se leva material ou ferramentas."
              className={`${classesEntrada} resize-y`}
            />
            {erros.descricao ? (
              <MensagemErro>{erros.descricao}</MensagemErro>
            ) : (
              <p id={id("descricao-ajuda")} className="flex justify-between gap-3 text-body-sm text-ink-muted">
                <span>Sem telefone: o contato aparece no match.</span>
                <span>{item.descricao.length}/3000</span>
              </p>
            )}
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 text-label">Preço</legend>
            <p className="flex gap-2 rounded-md bg-surface-300 p-3 text-body-sm text-ink">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Quem procura costuma escolher quem mostra o preço. Informe um valor de referência (aparece como “a
                partir de”); se preferir, marque “A combinar”.
              </span>
            </p>
            {!item.combinar && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={id("valor")} className="text-label">
                    A partir de (R$)
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-body text-ink-muted">
                      R$
                    </span>
                    <input
                      id={id("valor")}
                      value={item.valor}
                      onChange={(e) => mudar({ valor: e.target.value })}
                      inputMode="decimal"
                      placeholder="150"
                      aria-invalid={erros.pagamento_valor ? true : undefined}
                      className={`${classesEntrada} pl-10`}
                    />
                  </div>
                  {erros.pagamento_valor && <MensagemErro>{erros.pagamento_valor}</MensagemErro>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor={id("unidade")} className="text-label">
                    Por
                  </label>
                  <Seletor
                    id={id("unidade")}
                    value={item.unidade}
                    onChange={(e) => mudar({ unidade: e.target.value })}
                    aria-invalid={erros.pagamento_unidade ? true : undefined}
                    className={classesEntrada}
                  >
                    {UNIDADES_SERVICO.map((u) => (
                      <option key={u} value={u}>
                        {UNIDADES[u]}
                      </option>
                    ))}
                  </Seletor>
                  {erros.pagamento_unidade && <MensagemErro>{erros.pagamento_unidade}</MensagemErro>}
                </div>
              </div>
            )}
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 self-start text-label">
              <input
                type="checkbox"
                checked={item.combinar}
                onChange={(e) => mudar({ combinar: e.target.checked })}
                className="size-5 accent-[var(--pk-ink)]"
              />
              A combinar
            </label>
          </fieldset>

          <div className="flex flex-col gap-3">
            <div>
              <p className="text-label">
                Fotos de trabalhos <span className="font-normal text-ink-muted">(opcional, até {MAX_FOTOS})</span>
              </p>
              <p className="mt-0.5 text-body-sm text-ink-muted">
                Mostre serviços que você já fez. Nada de telefone, placa de carro ou rosto de cliente nas fotos.
              </p>
            </div>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {item.fotos.map((f, n) => {
                const url = urlDaFotoTrabalho(f);
                return (
                  <li key={f} className="relative aspect-square overflow-hidden rounded-md bg-surface-300">
                    {url && (
                      <Image src={url} alt={`Foto ${n + 1}`} fill unoptimized sizes="120px" className="object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => mudar({ fotos: item.fotos.filter((x) => x !== f) })}
                      className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-pill bg-surface-200/90 text-ink shadow-card hover:bg-surface-200"
                    >
                      <X aria-hidden className="size-4" />
                      <span className="sr-only">Tirar a foto {n + 1}</span>
                    </button>
                  </li>
                );
              })}
              {Array.from({ length: enviandoFotos }, (_, n) => (
                <li
                  key={`enviando-${n}`}
                  className="aspect-square animate-pulse rounded-md bg-surface-300"
                  aria-hidden
                />
              ))}
            </ul>
            {cabem > 0 && (
              <div>
                <input
                  ref={seletorFotos}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={escolherFotos}
                  className="sr-only"
                  tabIndex={-1}
                  aria-hidden
                />
                <Botao tamanho="sm" disabled={demo || enviandoFotos > 0} onClick={() => seletorFotos.current?.click()}>
                  <Camera aria-hidden />
                  {enviandoFotos > 0 ? "Enviando…" : "Adicionar fotos"}
                </Botao>
                {demo && (
                  <p className="mt-1 text-body-sm text-ink-muted">No modo demonstração não dá para enviar fotos.</p>
                )}
              </div>
            )}
            {(erroFoto || erros.fotos) && <MensagemErro>{erroFoto ?? erros.fotos}</MensagemErro>}
          </div>
        </>
      )}
    </section>
  );
}
