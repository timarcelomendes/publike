"use client";

import Link from "next/link";

import { Briefcase, FileUser, ImagePlus, Quote, Smile, Wrench, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import {
  escreverRecado,
  procurarCurriculoParaCitar,
  procurarParaCitar,
  type Citavel,
  type CurriculoCitavel,
} from "@/lib/acoes/recados";
import { reduzirImagem } from "@/lib/reduzir-imagem";
import { criarClienteNavegador } from "@/lib/supabase/navegador";

const MAXIMO = 280;

// Os modelos do post (claude/plano-posts-e-conquistas.md, parte 3): cada tipo de conta tem os seus. O texto começa
// pronto (dá para completar); "Estamos contratando" pede uma vaga sua no ar e "Bastidores", uma foto.
type Modelo = "livre" | "procuro" | "dica" | "contratando" | "bastidores";
const MODELOS_PESSOA: { valor: Modelo; nome: string; comeco: string }[] = [
  { valor: "procuro", nome: "Procuro trabalho", comeco: "Procuro trabalho de " },
  // pessoa também contrata (diarista, ajudante): o post leva a vaga que ela já publicou
  { valor: "contratando", nome: "Quero contratar", comeco: "Estou contratando! " },
  { valor: "dica", nome: "Dica para quem procura", comeco: "Dica para quem procura trabalho: " },
  { valor: "livre", nome: "Do meu jeito", comeco: "" },
];
const MODELOS_CONTRATA: { valor: Modelo; nome: string; comeco: string }[] = [
  { valor: "contratando", nome: "Estamos contratando", comeco: "Estamos contratando! " },
  { valor: "bastidores", nome: "Bastidores", comeco: "" },
  { valor: "livre", nome: "Do meu jeito", comeco: "" },
];
const COMECOS = new Set([...MODELOS_PESSOA, ...MODELOS_CONTRATA].map((m) => m.comeco).filter(Boolean));
const FOTO_MAX_BYTES = 8 * 1024 * 1024;
// as carinhas do recado: as mais usadas numa conversa de trabalho, sem precisar abrir o teclado do celular
const CARINHAS = [
  "😀",
  "😊",
  "😂",
  "🥰",
  "😍",
  "😉",
  "😎",
  "🤩",
  "🙏",
  "👏",
  "💪",
  "👍",
  "🙌",
  "🤝",
  "❤️",
  "🔥",
  "✨",
  "🎉",
  "🥳",
  "😅",
  "🤔",
  "😢",
  "📢",
  "💼",
];

/** A dica do botão: aparece em cima dele ao passar o mouse ou com o teclado (o leitor de tela lê o nome do botão). */
function Dica({ texto, lado = "meio" }: { texto: string; lado?: "meio" | "direita" }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute bottom-full z-20 mb-1.5 w-max max-w-64 rounded-md bg-ink px-2.5 py-1.5 text-[13px] leading-[18px] font-semibold text-surface-100 opacity-0 shadow-card transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 group-focus-visible:opacity-100 ${
        lado === "direita" ? "right-0" : "left-1/2 -translate-x-1/2"
      }`}
    >
      {texto}
    </span>
  );
}

/**
 * O campo do "agora", no topo da linha do tempo: o recado (até 280 letras), uma foto (reduzida no
 * navegador e enviada para recados/<pessoa>/) e, se quiser, uma vaga ou um serviço citado.
 */
export function EscreverRecado({
  pessoaId,
  autorTipo,
  avatar = null,
  focar = 0,
  aoEnviar,
}: {
  pessoaId: string;
  autorTipo: string | null;
  /** no topo da home: a foto da conta ao lado do campo (com a câmera para trocar) */
  avatar?: ReactNode;
  /** muda quando o "Recado" do celular abre o campo: o cursor vai para ele */
  focar?: number;
  /** o recado foi enviado (o convite para o primeiro recado sai da tela) */
  aoEnviar?: () => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<{ caminho: string; url: string } | null>(null);
  const [citado, setCitado] = useState<Citavel | null>(null);
  const [citando, setCitando] = useState(false);
  // "Compartilhar currículo": uma pessoa da aba Talentos no recado (ou a vaga, ou o currículo)
  const [curriculo, setCurriculo] = useState<CurriculoCitavel | null>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  const [buscaCurriculo, setBuscaCurriculo] = useState("");
  const [curriculos, setCurriculos] = useState<{ chave: string; itens: CurriculoCitavel[] } | null>(null);
  const [carinhas, setCarinhas] = useState(false);
  const [busca, setBusca] = useState("");
  const [minhas, setMinhas] = useState(autorTipo !== null && autorTipo !== "pessoa");
  // o resultado guarda de qual busca veio (para não mostrar o da busca anterior)
  const [achados, setAchados] = useState<{ chave: string; itens: Citavel[] } | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  // tocou no campo (ou num dos botões): abre; saiu de tudo, vazio: fecha
  const [ativo, setAtivo] = useState(false);
  const [modelo, setModelo] = useState<Modelo>("livre");
  const [pendente, iniciar] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  const contratando = autorTipo !== null && autorTipo !== "pessoa";
  const modelos = contratando ? MODELOS_CONTRATA : MODELOS_PESSOA;

  /** Escolhe o modelo: o texto começa pronto (se o campo estiver vazio ou só com o começo de outro modelo). */
  function escolherModelo(m: (typeof modelos)[number]) {
    setModelo(m.valor);
    setAviso(null);
    if (!texto.trim() || COMECOS.has(texto)) setTexto(m.comeco);
    if (m.valor === "contratando") {
      // a vaga: a busca abre nas suas vagas no ar
      setMinhas(true);
      setCitando(!citado);
      setCompartilhando(false);
    } else if (m.valor === "procuro" && !curriculo) {
      // o seu currículo: a lista abre (o seu vem primeiro)
      setCompartilhando(true);
      setCitando(false);
    }
    requestAnimationFrame(() => {
      const t = campo.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(t.value.length, t.value.length);
    });
  }
  const restam = MAXIMO - texto.length;
  const termo = busca.trim();
  const chaveDaBusca = `${minhas ? "minhas" : "todas"}|${termo}`;
  // em Todas, só com 2 letras ou mais; em Minhas vagas, já lista tudo o que está no ar
  const podeProcurar = minhas || termo.length >= 2;
  const pronto = podeProcurar && achados?.chave === chaveDaBusca;
  const lista = pronto ? achados.itens : [];

  useEffect(() => {
    if (focar) campo.current?.focus();
  }, [focar]);

  // a caixa cresce com o texto (até umas 6 linhas)
  useEffect(() => {
    const t = campo.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
  }, [texto]);

  // "Compartilhar currículo": pelo nome, cargo ou habilidade (sem palavra, os mais recentes)
  const termoCurriculo = buscaCurriculo.trim();
  const listaCurriculos = curriculos?.chave === termoCurriculo ? curriculos.itens : [];
  useEffect(() => {
    if (!compartilhando) return;
    const espera = setTimeout(() => {
      procurarCurriculoParaCitar(termoCurriculo)
        .then((itens) => setCurriculos({ chave: termoCurriculo, itens }))
        .catch(() => setCurriculos({ chave: termoCurriculo, itens: [] }));
    }, 300);
    return () => clearTimeout(espera);
  }, [compartilhando, termoCurriculo]);

  /** Põe a carinha onde está o cursor (ou no fim) e volta o cursor para o texto. */
  function porCarinha(carinha: string) {
    const t = campo.current;
    const inicio = t?.selectionStart ?? texto.length;
    const fim = t?.selectionEnd ?? texto.length;
    const novo = texto.slice(0, inicio) + carinha + texto.slice(fim);
    if (novo.length > MAXIMO) return;
    setTexto(novo);
    requestAnimationFrame(() => {
      if (!t) return;
      t.focus();
      t.setSelectionRange(inicio + carinha.length, inicio + carinha.length);
    });
  }

  // "Citar vaga": procura pelo cargo ou pela empresa, um pouco depois de parar de digitar
  useEffect(() => {
    if (!citando || !podeProcurar) return;
    const espera = setTimeout(() => {
      procurarParaCitar(termo, minhas)
        .then((itens) => setAchados({ chave: chaveDaBusca, itens }))
        .catch(() => setAchados({ chave: chaveDaBusca, itens: [] }));
    }, 300);
    return () => clearTimeout(espera);
  }, [citando, podeProcurar, termo, minhas, chaveDaBusca]);

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    if (!arquivo.type.startsWith("image/")) return setAviso({ ok: false, texto: "Escolha uma imagem (JPG ou PNG)." });
    if (arquivo.size > FOTO_MAX_BYTES) return setAviso({ ok: false, texto: "A foto passa de 8 MB. Escolha outra." });
    setEnviandoFoto(true);
    setAviso(null);
    try {
      const imagem = await reduzirImagem(arquivo, 1280);
      const caminho = `${pessoaId}/${Date.now()}.jpg`;
      const { error } = await criarClienteNavegador()
        .storage.from("recados")
        .upload(caminho, imagem, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      if (foto) void tirarFoto(foto.caminho);
      setFoto({ caminho, url: URL.createObjectURL(imagem) });
    } catch {
      setAviso({ ok: false, texto: "Não foi possível enviar a foto. Tente outra imagem." });
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function tirarFoto(caminho: string) {
    await criarClienteNavegador()
      .storage.from("recados")
      .remove([caminho])
      .catch(() => {});
  }

  function publicar() {
    if (!texto.trim()) return setAviso({ ok: false, texto: "Escreva o post." });
    if (modelo === "contratando" && (!citado || citado.tipo !== "vaga"))
      return setAviso({
        ok: false,
        texto: "Escolha a vaga que você já publicou (em “Citar uma vaga”, nas suas vagas). Ainda não publicou? Toque em Publicar.",
      });
    if (modelo === "bastidores" && !foto)
      return setAviso({ ok: false, texto: "Ponha uma foto da equipe, do lugar ou do dia a dia no “Bastidores”." });
    const dados = new FormData();
    dados.set("texto", texto);
    if (foto) dados.set("foto", foto.caminho);
    if (citado) dados.set("anuncio_id", citado.id);
    if (curriculo) dados.set("talento_id", curriculo.id);
    dados.set("modelo", modelo);
    setAviso(null);
    iniciar(async () => {
      // sem chegar ao servidor, o recado fica no campo e o aviso aparece
      const r = await chamarAcao(() => escreverRecado(dados));
      if (!r.ok) {
        setAviso({ ok: false, texto: r.erro });
        if ("ir" in r && r.ir) router.push(r.ir);
        return;
      }
      setTexto("");
      setFoto(null);
      setCitado(null);
      setCitando(false);
      setBusca("");
      setCurriculo(null);
      setCompartilhando(false);
      setBuscaCurriculo("");
      setCarinhas(false);
      setModelo("livre");
      setAviso({ ok: true, texto: r.mensagem ?? "Post enviado." });
      aoEnviar?.();
    });
  }

  const aberto =
    ativo ||
    Boolean(texto) ||
    Boolean(foto) ||
    Boolean(citado) ||
    Boolean(curriculo) ||
    citando ||
    compartilhando ||
    carinhas ||
    pendente ||
    enviandoFoto;
  // já tem vaga ou currículo no recado: os dois botões ficam apagados (um de cada vez)
  const temCitacao = Boolean(citado) || Boolean(curriculo);
  // as ações do post: pequenas, com ícone e nome
  const ACAO =
    "inline-flex min-h-9 items-center gap-1.5 rounded-pill px-2.5 text-[13px] leading-[18px] font-semibold text-ink-muted transition-colors hover:bg-surface-300 hover:text-ink";
  // o botão com a dica em cima (a dica fica fora do botão para não ser cortada)
  const comDica = "group relative shrink-0";

  // Fechado: uma linha só (a foto, "Conte o que você procura…" e os ícones de foto e de citar).
  // Ao tocar, abre: a foto escolhida, a vaga citada e o "Postar".
  return (
    <div
      onFocus={() => setAtivo(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAtivo(false);
      }}
      className={`min-w-0 border border-line bg-surface-200 p-1.5 shadow-card transition-[border-radius] ${
        aberto ? "rounded-lg sm:p-2" : "rounded-[28px]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {avatar}
        <label htmlFor={`${id}-texto`} className="sr-only">
          Escrever um post para quem está perto
        </label>
        <textarea
          id={`${id}-texto`}
          ref={campo}
          rows={1}
          maxLength={MAXIMO}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={contratando ? "Conte quem você está contratando…" : "Conte o que você procura…"}
          className="block min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 text-[16px] leading-6 text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      {/* o tipo do post, sempre à vista (a novidade de 09/11/2026): o texto começa pronto; "do meu jeito" é o livre */}
      <div role="group" aria-label="Tipo do post" className="mt-1.5 flex flex-wrap gap-1.5 px-1">
        {modelos.map((m) => (
          <button
            key={m.valor}
            type="button"
            aria-pressed={modelo === m.valor}
            onClick={() => escolherModelo(m)}
            className={`min-h-8 rounded-pill px-3 text-[13px] font-semibold transition-colors ${
              modelo === m.valor ? "bg-ink text-surface-100" : "bg-surface-300 text-ink hover:bg-line"
            }`}
          >
            {m.nome}
          </button>
        ))}
      </div>
      {aberto && modelo === "bastidores" && !foto && (
        <p className="mt-1.5 px-2 text-body-sm text-ink-muted">
          Ponha uma foto da equipe, do lugar ou do dia a dia (em Foto). Se quiser, cite uma vaga.
        </p>
      )}
      {modelo === "contratando" && !citado && (
        <p className="mt-1.5 px-2 text-body-sm text-ink-muted">
          Escolha a vaga que você já publicou: ela aparece no post com o Curtir, e quem se interessar se candidata ali
          mesmo.
        </p>
      )}
      {aberto && modelo === "procuro" && !curriculo && (
        <p className="mt-1.5 px-2 text-body-sm text-ink-muted">
          Com o seu currículo junto, as empresas veem o que você já fez e você ganha o selo “Procurando agora” na aba
          Talentos.
        </p>
      )}

      {/* o que dá para pôr no post, com o nome à vista (antes eram só ícones) */}
      <div role="group" aria-label="Pôr no post" className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 px-0.5">
        <button type="button" aria-expanded={carinhas} onClick={() => setCarinhas((c) => !c)} className={ACAO}>
          <Smile aria-hidden className="size-4" />
          Carinhas
        </button>
        <label className={`${ACAO} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus ${enviandoFoto ? "opacity-60" : ""}`}>
          <ImagePlus aria-hidden className="size-4" />
          {enviandoFoto ? "Enviando a foto…" : "Foto"}
          <input type="file" accept="image/*" onChange={escolherFoto} disabled={enviandoFoto} className="sr-only" />
        </label>
        <button
          type="button"
          aria-expanded={citando}
          onClick={() => {
            setCitando((c) => !c);
            setCompartilhando(false);
          }}
          disabled={temCitacao}
          className={`${ACAO} disabled:opacity-50`}
        >
          <Quote aria-hidden className="size-4" />
          Citar uma vaga
        </button>
        <button
          type="button"
          aria-expanded={compartilhando}
          onClick={() => {
            setCompartilhando((c) => !c);
            setCitando(false);
          }}
          disabled={temCitacao}
          className={`${ACAO} disabled:opacity-50`}
        >
          <FileUser aria-hidden className="size-4" />
          Currículo
        </button>
      </div>

      {carinhas && (
        <div
          role="group"
          aria-label="Carinhas"
          className="mt-1.5 flex flex-wrap gap-0.5 rounded-md border border-line bg-surface-100 p-1.5"
        >
          {CARINHAS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => porCarinha(c)}
              className="grid size-10 place-items-center rounded-md text-[22px] leading-none hover:bg-surface-300"
            >
              <span aria-hidden>{c}</span>
              <span className="sr-only">Pôr {c}</span>
            </button>
          ))}
        </div>
      )}

      {foto && (
        <div className="relative mt-2.5 w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt="" className="max-h-44 rounded-[12px] object-cover" />
          <button
            type="button"
            onClick={() => {
              void tirarFoto(foto.caminho);
              setFoto(null);
            }}
            className="absolute top-1.5 right-1.5 grid size-8 place-items-center rounded-pill bg-[rgb(23_19_15/0.7)] text-on-hero"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Tirar a foto</span>
          </button>
        </div>
      )}

      {citado && (
        <p className="mt-2.5 flex w-fit max-w-full items-center gap-2 rounded-pill bg-surface-300 py-1 pr-1 pl-3 text-body-sm">
          {citado.tipo === "servico" ? (
            <Wrench aria-hidden className="size-4 shrink-0 text-cerrado-text" />
          ) : (
            <Briefcase aria-hidden className="size-4 shrink-0 text-terra-text" />
          )}
          <span className="truncate">
            Citando <b className="font-semibold">{citado.titulo}</b> · {citado.autor}
          </span>
          <button
            type="button"
            onClick={() => setCitado(null)}
            className="grid size-7 shrink-0 place-items-center rounded-pill hover:bg-surface-100"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Tirar a vaga citada</span>
          </button>
        </p>
      )}

      {curriculo && (
        <p className="mt-2.5 flex w-fit max-w-full items-center gap-2 rounded-pill bg-surface-300 py-1 pr-1 pl-3 text-body-sm">
          <FileUser aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <span className="truncate">
            {curriculo.seu ? (
              <>
                Compartilhando <b className="font-semibold">o seu currículo</b>
              </>
            ) : (
              <>
                Compartilhando o currículo de <b className="font-semibold">{curriculo.nome}</b>
              </>
            )}
            {curriculo.titulo && ` · ${curriculo.titulo}`}
          </span>
          <button
            type="button"
            onClick={() => setCurriculo(null)}
            className="grid size-7 shrink-0 place-items-center rounded-pill hover:bg-surface-100"
          >
            <X aria-hidden className="size-4" />
            <span className="sr-only">Tirar o currículo</span>
          </button>
        </p>
      )}

      {compartilhando && !temCitacao && (
        <div className="mt-2.5 rounded-md border border-line bg-surface-100 p-2">
          <p className="mb-2 text-body-sm font-semibold">
            {modelo === "procuro" ? "Escolha o seu currículo" : "Compartilhe o currículo de alguém"}
          </p>
          <label className="block">
            <span className="sr-only">Procurar pelo nome, cargo ou habilidade</span>
            <input
              type="search"
              autoFocus
              value={buscaCurriculo}
              onChange={(e) => setBuscaCurriculo(e.target.value)}
              placeholder="Procure pelo nome, cargo ou habilidade: Maria, cozinheira…"
              className="min-h-10 w-full rounded-md border border-line-strong bg-surface-200 px-3 text-body"
            />
          </label>
          {listaCurriculos.length > 0 && (
            <ul className="mt-1.5 flex flex-col" aria-label="Currículos para compartilhar">
              {listaCurriculos.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCurriculo(t);
                      setCompartilhando(false);
                    }}
                    className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-body-sm hover:bg-surface-300"
                  >
                    <FileUser aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    <span className="truncate">
                      <b className="font-semibold">{t.seu ? "Seu currículo" : t.nome}</b>
                      {t.titulo && ` · ${t.titulo}`}
                      {t.bairro && <span className="text-ink-muted"> · {t.bairro}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {curriculos?.chave === termoCurriculo && listaCurriculos.length === 0 && (
            <p className="mt-1.5 px-1 text-body-sm text-ink-muted">
              {termoCurriculo ? "Ninguém na aba Talentos com esse nome ou cargo." : "Ninguém na aba Talentos ainda."}
            </p>
          )}
          <p className="mt-1.5 px-1 text-caption text-ink-muted">
            Só aparecem as pessoas que deixaram o currículo na aba Talentos.
          </p>
        </div>
      )}

      {citando && !temCitacao && (
        <div className="mt-2.5 rounded-md border border-line bg-surface-100 p-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-body-sm font-semibold">Cite uma vaga ou serviço</p>
            <div role="group" aria-label="Onde procurar" className="flex gap-1">
              {[
                { valor: false, nome: "Todas", dica: "Procurar em todas as vagas e serviços no ar" },
                { valor: true, nome: "Minhas vagas", dica: "Só as suas vagas e serviços" },
              ].map((o) => (
                <span key={o.nome} className={comDica}>
                  <button
                    type="button"
                    aria-pressed={minhas === o.valor}
                    onClick={() => setMinhas(o.valor)}
                    className={`min-h-8 rounded-pill px-3 text-[13px] font-semibold ${
                      minhas === o.valor ? "bg-ink text-surface-100" : "bg-surface-300 text-ink hover:bg-line"
                    }`}
                  >
                    {o.nome}
                  </button>
                  <Dica texto={o.dica} lado={o.valor ? "direita" : "meio"} />
                </span>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="sr-only">
              {minhas ? "Procurar nas suas vagas" : "Procurar pelo cargo ou pela empresa"}
            </span>
            <input
              type="search"
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={
                minhas ? "Procure nas suas vagas e serviços…" : "Procure pelo cargo ou pela empresa: garçom, Padaria…"
              }
              className="min-h-10 w-full rounded-md border border-line-strong bg-surface-200 px-3 text-body"
            />
          </label>
          {lista.length > 0 && (
            <ul className="mt-1.5 flex flex-col" aria-label="Vagas e serviços para citar">
              {lista.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setCitado(a);
                      setCitando(false);
                    }}
                    className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-left text-body-sm hover:bg-surface-300"
                  >
                    {a.tipo === "servico" ? (
                      <Wrench aria-hidden className="size-4 shrink-0 text-cerrado-text" />
                    ) : (
                      <Briefcase aria-hidden className="size-4 shrink-0 text-terra-text" />
                    )}
                    <span className="truncate">
                      <b className="font-semibold">{a.titulo}</b> · {a.autor}
                      {a.bairro && <span className="text-ink-muted"> · {a.bairro}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {pronto && lista.length === 0 && (
            <p className="mt-1.5 px-1 text-body-sm text-ink-muted">
              {minhas && !termo ? (
                <>
                  Você não tem vaga nem serviço no ar agora.{" "}
                  <Link href="/publicar" className="font-semibold text-ink underline underline-offset-2">
                    Publicar uma vaga
                  </Link>
                </>
              ) : minhas
                ? "Nenhuma vaga sua com esse nome."
                  : "Nada no ar com esse cargo ou empresa."}
            </p>
          )}
        </div>
      )}

      {aberto && (
        <div className="mt-1.5 flex items-center justify-end gap-2 border-t border-line px-1 pt-2">
          <span
            aria-live="polite"
            className={`pr-1 text-body-sm tabular-nums ${restam < 20 ? "font-semibold text-danger" : "text-ink-muted"}`}
          >
            {texto.length > 0 && `${texto.length}/${MAXIMO}`}
          </span>
          <button
            type="button"
            onClick={publicar}
            disabled={pendente || enviandoFoto || !texto.trim()}
            className="inline-flex min-h-9 items-center rounded-pill bg-ink px-4 text-label font-bold text-surface-100 disabled:opacity-45"
          >
            {pendente ? "Enviando…" : "Postar"}
          </button>
        </div>
      )}
      {aviso && (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`mt-1.5 px-2.5 pb-1 text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
