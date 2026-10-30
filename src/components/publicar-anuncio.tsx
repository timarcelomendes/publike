"use client";

import {
  CalendarClock,
  Check,
  ClipboardPaste,
  Heart,
  ImageUp,
  LoaderCircle,
  MapPin,
  RotateCcw,
  Sparkles,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import { ERRO_SEM_SALVAR, ehNavegacao } from "@/lib/acao-segura";
import { conferirAnuncio, salvarAnuncio } from "@/lib/acoes/anuncios";
import { detalheDoErro, relatarFalha } from "@/lib/falhas";
import type { ClienteParaVaga } from "@/lib/clientes";
import { REGIMES } from "@/lib/constantes";
import { formatarValor } from "@/lib/formato";
import { MODELOS_ANUNCIO, type ModeloAnuncio } from "@/lib/modelos-anuncio";
import { lerNumeroBR } from "@/lib/numero";
import {
  apagarRascunho,
  CHAVE_COM_CONTA,
  formDataDoRascunho,
  guardarRascunho,
  lerRascunhoGuardado,
  valoresDoRascunho,
  type Rascunho,
} from "@/lib/rascunho-anuncio";
import type { Regime } from "@/lib/tipos";
import { ganhosDoBanco, lerGanhosExtras } from "@/lib/vaga-extra";
import { valoresDoConvite } from "@/lib/valores-convite";
import { ArteDaVaga } from "./arte-da-vaga";
import { TextoDaVaga } from "./texto-da-vaga";
import { AvisoConvite } from "./aviso-convite";
import { FormAnuncio, type ValoresAnuncio } from "./form-anuncio";
import { Avatar, Aviso, Selo } from "./ui/basicos";
import { jeitosDeEntrar } from "@/lib/login-social";

// Publicar uma vaga: os modelos prontos em cima, a prévia de como a vaga aparece e,
// para quem ainda não entrou, o rascunho guardado no aparelho. Depois de entrar
// (?continuar=1), o rascunho é publicado sozinho.

/** A prévia antes de a pessoa escrever qualquer coisa (o título vira um texto de exemplo apagado). */
const PREVIA_VAZIA: Previa = {
  titulo: "",
  valor: "Valor a combinar",
  regime: null,
  lugar: "",
  comecaJa: false,
  contatoDireto: false,
};

type Previa = {
  titulo: string;
  valor: string;
  regime: string | null;
  lugar: string;
  comecaJa: boolean;
  contatoDireto: boolean;
};

function lerPrevia(form: HTMLFormElement): Previa {
  const f = new FormData(form);
  const t = (k: string) => {
    const v = f.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const combinar = t("combinar") === "on";
  const valor = lerNumeroBR(t("pagamento_valor"));
  const ate = lerNumeroBR(t("pagamento_ate"));
  const ganhos = lerGanhosExtras(t("ganhos_extras"));
  return {
    titulo: t("titulo"),
    valor: formatarValor(
      combinar || valor == null || !Number.isFinite(valor) ? null : valor,
      combinar ? null : t("pagamento_unidade") || null,
      null,
      false,
      { ate: ate != null && Number.isFinite(ate) ? ate : null, ganhos: ganhos.ok ? ganhos.lista : [] },
    ),
    regime: REGIMES[t("regime") as Regime]?.selo ?? null,
    lugar: [t("bairro"), t("cidade")].filter(Boolean).join(", "),
    comecaJa: t("comeca_ja") === "on",
    contatoDireto: t("contato_direto") === "on",
  };
}

function aplicarModelo(m: ModeloAnuncio, atual: ValoresAnuncio): ValoresAnuncio {
  return {
    ...atual,
    titulo: m.titulo,
    descricao: m.descricao,
    categoria: m.categoria,
    regime: m.regime,
    combinar: false,
    pagamento_valor: m.valor,
    pagamento_ate: m.ate,
    pagamento_unidade: m.unidade,
    comissao: m.comissao ?? false,
    ganhos_extras: ganhosDoBanco([], m.comissao),
    jornada: m.jornada ?? null,
    beneficios_lista: m.beneficios ?? [],
    pede_curriculo: m.pedeCurriculo ?? false,
  };
}

/** O lugar e a empresa já escritos no formulário (trocar de modelo não apaga o bairro nem o cliente). */
function lugarDoFormulario(form: HTMLFormElement | null, base: ValoresAnuncio): ValoresAnuncio {
  if (!form) return base;
  const dados = new FormData(form);
  const r: Rascunho = { salvo_em: Date.now(), campos: [] };
  for (const [k, v] of dados.entries())
    if (typeof v === "string" && ["cidade", "bairro", "cep", "endereco", "lat", "lng"].includes(k))
      r.campos.push([k, v]);
  r.campos.push(["titulo", "x"]);
  const lido = valoresDoRascunho(r, base);
  const texto = (k: string) => {
    const v = dados.get(k);
    return typeof v === "string" ? v : null;
  };
  return {
    ...base,
    cidade: lido.cidade,
    bairro: lido.bairro,
    cep: lido.cep,
    endereco: lido.endereco,
    lat: lido.lat,
    lng: lido.lng,
    // agência: o cliente escolhido (ou a empresa escrita) e a marcação de confidencial
    ...(dados.has("agencia")
      ? {
          cliente_id: texto("cliente_id") || null,
          contratante: texto("contratante") ?? base.contratante ?? null,
          contratante_confidencial: texto("contratante_confidencial") === "on",
        }
      : {}),
  };
}

export function PublicarAnuncio({
  inicial: base,
  semConta = false,
  continuar = false,
  comModelos = false,
  ia = false,
  agencia = false,
  contatoAgencia = null,
  clientes = null,
  enderecoPublico = false,
  convite = null,
  modelo: modeloPedido = null,
  comecarConferindo = false,
  autor = null,
}: {
  /** a vaga já veio pronta (Publicar parecida, convite com a vaga): abre no passo 5, Conferir */
  comecarConferindo?: boolean;
  /** o nome da conta, na prévia (sem conta: "Sua empresa") */
  autor?: string | null;
  /** o modelo para abrir já aplicado (`/publicar?modelo=diarista`, do vazio de Serviços) */
  modelo?: string | null;
  inicial: ValoresAnuncio;
  /** quem ainda não entrou: o formulário confere e leva para entrar */
  semConta?: boolean;
  /** acabou de entrar: publica o rascunho guardado */
  continuar?: boolean;
  /** vaga nova do zero (não "publicar parecida") */
  comModelos?: boolean;
  /** a ajuda da IA está ligada: "Melhorar texto" e "Tem a arte da vaga?" (só com conta) */
  ia?: boolean;
  agencia?: boolean;
  contatoAgencia?: { whatsapp: string | null; email: string | null } | null;
  /** agência: os clientes para escolher */
  clientes?: ClienteParaVaga[] | null;
  enderecoPublico?: boolean | "talvez";
  /** veio do link do convite do Publike: publicar é o aceite */
  convite?: { token: string; nome: string; pronta: boolean } | null;
}) {
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  const modeloInicial = comModelos ? (MODELOS_ANUNCIO.find((m) => m.id === modeloPedido) ?? null) : null;
  const [inicial, setInicial] = useState(() => (modeloInicial ? aplicarModelo(modeloInicial, base) : base));
  const [chave, setChave] = useState(0);
  const [modelo, setModelo] = useState<string | null>(modeloInicial?.id ?? null);
  const [aviso, setAviso] = useState<"restaurado" | "publicando" | "lido" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const tempo = useRef<number | null>(null);
  // em passos: onde o formulário começa (5 quando a vaga veio pronta) e o passo aberto (para o rascunho)
  const [passoDeComeco, setPassoDeComeco] = useState(comecarConferindo || convite?.pronta ? 5 : 1);
  const passoAtual = useRef(passoDeComeco);
  // os atalhos do passo 1: os modelos ou a foto da vaga (quem chega por /publicar#arte já vê a foto)
  const [atalho, setAtalho] = useState<"modelo" | "texto" | "foto" | null>(modeloInicial ? "modelo" : null);
  // "Colar o texto da vaga": quantas vagas a IA achou no texto (publica-se uma por vez)
  const [doTexto, setDoTexto] = useState<number | null>(null);
  const chaveDoRascunho = semConta ? undefined : CHAVE_COM_CONTA;

  const formulario = () => raiz.current?.querySelector("form") ?? null;

  // ao abrir: publica o rascunho de quem acabou de entrar, ou traz de volta o que ficou pela metade
  useEffect(() => {
    // fora do corpo do efeito: o localStorage só existe no navegador
    const t = window.setTimeout(() => abrir(), 0);
    return () => window.clearTimeout(t);
    function abrir() {
      if (window.location.hash === "#arte") setAtalho("foto");
      // quem já entrou guarda à parte o que estava escrevendo (volta no passo em que parou)
      const comConta = !semConta && !continuar ? lerRascunhoGuardado(CHAVE_COM_CONTA) : null;
      if (comConta && !convite && !modeloInicial && !comecarConferindo) {
        setInicial(valoresDoRascunho(comConta, base));
        setPassoDeComeco(comConta.passo ?? 1);
        passoAtual.current = comConta.passo ?? 1;
        setChave((c) => c + 1);
        setAviso("restaurado");
        return;
      }
      const r = lerRascunhoGuardado();
      if (!r) return;
      // a vaga do convite vem pronta: o rascunho antigo deste aparelho não passa por cima dela
      if (convite && !continuar) return;
      // veio com um modelo pedido (o vazio de Serviços): o rascunho antigo também não passa por cima
      if (modeloInicial && !continuar) return;
      if (continuar && !semConta) {
        // agência: o formulário sem conta não pede a empresa contratante, e o banco recusa a vaga sem
        // ela. Em vez do erro, o formulário volta preenchido, no campo da empresa.
        const preenchido = (k: string) => r.campos.some(([c, v]) => c === k && v.trim() !== "");
        const semEmpresa =
          !preenchido("contratante") && !preenchido("cliente_id") && !preenchido("contratante_confidencial");
        if (agencia && semEmpresa) {
          apagarRascunho();
          setInicial(valoresDoRascunho(r, base));
          setChave((c) => c + 1);
          setErro("Falta só dizer para qual empresa é a vaga, ou marcar Empresa confidencial.");
          window.setTimeout(() => {
            const campo =
              document.getElementById("contratante") ?? document.querySelector<HTMLElement>("[name=cliente_id]");
            campo?.scrollIntoView({ block: "center" });
            campo?.focus();
          }, 300);
          return;
        }
        apagarRascunho();
        setAviso("publicando");
        startTransition(async () => {
          // deu certo: a ação leva para a vaga publicada; voltou: mostra o formulário com o erro
          let resultado: Awaited<ReturnType<typeof salvarAnuncio>>;
          try {
            resultado = await salvarAnuncio({ ok: false }, formDataDoRascunho(r));
          } catch (e) {
            if (ehNavegacao(e)) throw e;
            // não chegou ao servidor: o rascunho volta e a pessoa vê o motivo (e a equipe fica sabendo)
            console.error("Publike: a vaga guardada não chegou ao servidor:", e);
            relatarFalha({ onde: "vaga", etapa: "conexao", mensagem: ERRO_SEM_SALVAR, detalhe: detalheDoErro(e) });
            resultado = { ok: false, erro: ERRO_SEM_SALVAR };
          }
          if (!resultado || resultado.ok) return;
          try {
            localStorage.setItem("publike_rascunho_vaga", JSON.stringify(r));
          } catch {}
          setInicial(valoresDoRascunho(r, base));
          setChave((c) => c + 1);
          setAviso(null);
          setErro(
            resultado.erros
              ? `Falta ajustar: ${Object.values(resultado.erros).slice(0, 2).join(" ")}`
              : (resultado.erro ?? "Não deu para publicar agora. Confira e tente de novo."),
          );
        });
        return;
      }
      setInicial(valoresDoRascunho(r, base));
      setPassoDeComeco(r.passo ?? 1);
      passoAtual.current = r.passo ?? 1;
      setChave((c) => c + 1);
      setAviso("restaurado");
    }
    // só na abertura da página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a prévia acompanha o que a pessoa escreve; sem conta, o rascunho também
  function aoMexer() {
    if (tempo.current) window.clearTimeout(tempo.current);
    tempo.current = window.setTimeout(() => {
      const f = formulario();
      if (!f) return;
      setPrevia(lerPrevia(f));
      guardarRascunho(f, chaveDoRascunho, passoAtual.current);
    }, 250);
  }
  useEffect(() => {
    const t = window.setTimeout(() => {
      const f = formulario();
      if (f) setPrevia(lerPrevia(f));
    }, 0);
    return () => window.clearTimeout(t);
  }, [chave]);

  function escolher(m: ModeloAnuncio | null) {
    const atual = lugarDoFormulario(formulario(), base);
    setInicial(m ? aplicarModelo(m, atual) : { ...base, cidade: atual.cidade, bairro: atual.bairro });
    setModelo(m?.id ?? null);
    setPassoDeComeco(1);
    passoAtual.current = 1;
    setChave((c) => c + 1);
    setAviso(null);
  }

  // a cada passo, o rascunho guarda onde a pessoa está
  function aoMudarPasso(n: number) {
    passoAtual.current = n;
    const f = formulario();
    if (f) guardarRascunho(f, chaveDoRascunho, n);
  }

  // "Tem a arte da vaga?": o que a IA leu da imagem entra no formulário (o lugar já escrito fica)
  function aplicarArte(vaga: Parameters<typeof valoresDoConvite>[0], total: number | null = null) {
    setDoTexto(total);
    setInicial(valoresDoConvite(vaga, lugarDoFormulario(formulario(), base)));
    setModelo(null);
    // a vaga veio pronta da imagem: abre no Conferir
    setPassoDeComeco(5);
    passoAtual.current = 5;
    setAtalho(null);
    setChave((c) => c + 1);
    setAviso("lido");
  }

  function seguirParaEntrar() {
    const f = formulario();
    if (f) guardarRascunho(f);
    router.push(`/entrar?next=${encodeURIComponent("/publicar?continuar=1")}`);
  }

  if (aviso === "publicando") {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface-200 px-5 py-12 text-center"
      >
        <LoaderCircle aria-hidden className="size-8 animate-spin text-ink-muted" />
        <p className="font-display text-h3">Publicando sua vaga…</p>
        <p className="text-body-sm text-ink-muted">É o anúncio que você preencheu antes de entrar.</p>
      </div>
    );
  }

  return (
    <div
      ref={raiz}
      onInput={aoMexer}
      onChange={aoMexer}
      // ao publicar, o rascunho de quem tem conta sai (se der errado, o formulário continua preenchido)
      onSubmitCapture={() => {
        if (!semConta) apagarRascunho(CHAVE_COM_CONTA);
      }}
      className="flex flex-col gap-6"
    >
      {convite && (
        <AvisoConvite token={convite.token} nome={convite.nome}>
          {convite.pronta
            ? "A vaga já veio preenchida com o anúncio de vocês. Confira, ajuste o que precisar e toque em Publicar."
            : "Escreva a vaga e toque em Publicar."}{" "}
          É grátis, sem plano e sem taxa. Para publicar, você entra com o e-mail, sem senha.
        </AvisoConvite>
      )}
      {semConta && !convite && (
        <Aviso tipo="info" titulo="Não precisa de conta para começar">
          Preencha a vaga. No fim, é só entrar com {jeitosDeEntrar()} e ela vai ao ar na hora. O que você escreve fica
          guardado neste aparelho.
        </Aviso>
      )}
      {aviso === "restaurado" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-surface-300 px-4 py-3 text-body-sm">
          <RotateCcw aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <span className="flex-1">Continuamos de onde você parou.</span>
          <button
            type="button"
            onClick={() => {
              apagarRascunho();
              apagarRascunho(CHAVE_COM_CONTA);
              escolher(null);
            }}
            className="min-h-10 font-semibold underline underline-offset-2"
          >
            Começar do zero
          </button>
        </div>
      )}
      {aviso === "lido" && (
        <Aviso
          tipo="info"
          titulo={doTexto ? "Preenchemos com o que estava no texto" : "Preenchemos com o que estava na imagem"}
        >
          {doTexto && doTexto > 1
            ? `Achamos ${doTexto} vagas no texto: publique esta e depois cole o texto de novo para a próxima. `
            : ""}
          Confira cada passo antes de publicar (toque em Editar): o título, o valor, o que a vaga pede e o endereço.
        </Aviso>
      )}
      {erro && (
        <Aviso tipo="alerta" titulo="Sua vaga ainda não foi publicada">
          {erro}
        </Aviso>
      )}

      <FormAnuncio
        key={chave}
        inicial={inicial}
        acaoSalvar={semConta ? conferirAnuncio : salvarAnuncio}
        semConta={semConta}
        aposConferir={semConta ? seguirParaEntrar : undefined}
        ia={ia && !semConta}
        agencia={agencia}
        contatoAgencia={contatoAgencia}
        clientes={clientes}
        enderecoPublico={enderecoPublico}
        // a prévia aparece desde o passo 1 (sem título ainda, um texto de exemplo apagado)
        previa={
          <PreviaDaVaga
            p={previa?.titulo ? previa : { ...PREVIA_VAZIA, ...(previa ?? {}), titulo: "" }}
            autor={autor || "Sua empresa"}
          />
        }
        extras={convite ? { convite: convite.token } : undefined}
        jaMudou={aviso === "lido"}
        passos
        passoInicial={passoDeComeco}
        aoMudarPasso={aoMudarPasso}
        atalhos={
          comModelos ? (
            <div className="flex flex-col gap-3 rounded-lg bg-surface-300 p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-label">Para ir mais rápido:</span>
                <button
                  type="button"
                  aria-expanded={atalho === "modelo"}
                  onClick={() => setAtalho((a) => (a === "modelo" ? null : "modelo"))}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label ${
                    atalho === "modelo" ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-200"
                  }`}
                >
                  <Sparkles aria-hidden className="size-4" />
                  Usar um modelo
                </button>
                {ia && !semConta && (
                  <button
                    type="button"
                    aria-expanded={atalho === "texto"}
                    onClick={() => setAtalho((a) => (a === "texto" ? null : "texto"))}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label ${
                      atalho === "texto" ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-200"
                    }`}
                  >
                    <ClipboardPaste aria-hidden className="size-4" />
                    Colar o texto da vaga
                    <Selo variante="novo">Novo</Selo>
                  </button>
                )}
                {ia && !semConta && (
                  <button
                    type="button"
                    aria-expanded={atalho === "foto"}
                    onClick={() => setAtalho((a) => (a === "foto" ? null : "foto"))}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label ${
                      atalho === "foto" ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-200"
                    }`}
                  >
                    <ImageUp aria-hidden className="size-4" />
                    Mandar a foto da vaga
                  </button>
                )}
              </div>
              {atalho === "modelo" && (
                <ul aria-label="Modelos de vaga" className="flex flex-wrap gap-2">
                  {MODELOS_ANUNCIO.map((m) => {
                    const ativo = modelo === m.id;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          aria-pressed={ativo}
                          onClick={() => escolher(ativo ? null : m)}
                          className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
                            ativo
                              ? "border-ink bg-ink text-surface-100"
                              : "border-line bg-surface-200 hover:border-line-strong"
                          }`}
                        >
                          {ativo && <Check aria-hidden className="size-4" />}
                          {m.nome}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {atalho === "texto" && ia && !semConta && <TextoDaVaga aoLer={aplicarArte} />}
              {atalho === "foto" && ia && !semConta && <ArteDaVaga aoLer={(v) => aplicarArte(v)} />}
            </div>
          ) : null
        }
      />
    </div>
  );
}

/** Como a vaga aparece no Início (o tíquete da linha do tempo), com o que já foi escrito. */
function PreviaDaVaga({ p, autor }: { p: Previa; autor: string }) {
  return (
    <section aria-label="Prévia da vaga" className="flex flex-col gap-2">
      <p className="text-label text-ink-muted">Assim sua vaga aparece</p>
      <div className="grid grid-cols-[minmax(0,1fr)_9.5rem] overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
        <div className="flex min-w-0 gap-3 p-3.5">
          <Avatar nome={autor} tamanho={40} forma="quadrada" colorida />
          <div className="min-w-0">
            <p
              className={`font-display text-[17px] leading-[22px] font-bold break-words ${p.titulo ? "" : "text-ink-muted/70"}`}
            >
              {p.titulo || "O título da vaga aparece aqui"}
            </p>
            <p className="truncate text-body-sm font-semibold">{autor}</p>
            {p.lugar && (
              <p className="mt-1 flex items-center gap-1 text-body-sm text-ink-muted">
                <MapPin aria-hidden className="size-4 shrink-0 text-terra-text" />
                <span className="truncate">{p.lugar}</span>
              </p>
            )}
            <ul className="mt-2 flex flex-wrap gap-1.5 text-[13px] leading-[18px] font-semibold [&>li]:rounded-pill [&>li]:bg-surface-100 [&>li]:px-2.5 [&>li]:py-0.5">
              {p.regime && <li>{p.regime}</li>}
              {p.comecaJa && (
                <li className="inline-flex items-center gap-1 bg-terra-soft! text-terra-text">
                  <CalendarClock aria-hidden className="size-3.5" />
                  Começa já
                </li>
              )}
              {p.contatoDireto && (
                <li className="inline-flex items-center gap-1 text-cerrado-text">
                  <Zap aria-hidden className="size-3.5" />
                  Contato direto
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="flex flex-col justify-center gap-2 border-l-2 border-dashed border-line bg-surface-300 p-3">
          <p className="font-display text-[17px] leading-[22px] font-bold break-words">{p.valor}</p>
          <span className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-pill border border-line-strong bg-surface-200 text-label">
            <Heart aria-hidden className="size-4" />
            Curtir
          </span>
        </div>
      </div>
      <p className="text-body-sm text-ink-muted">Muda enquanto você preenche.</p>
    </section>
  );
}
