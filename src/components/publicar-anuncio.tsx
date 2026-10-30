"use client";

import {
  Briefcase,
  CalendarClock,
  Check,
  Circle,
  CircleCheck,
  ClipboardPaste,
  Heart,
  ImageUp,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  RotateCcw,
  Sparkles,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import { ERRO_SEM_SALVAR, ehNavegacao } from "@/lib/acao-segura";
import { conferirAnuncio, salvarAnuncio } from "@/lib/acoes/anuncios";
import { detalheDoErro, relatarFalha } from "@/lib/falhas";
import type { ClienteParaVaga } from "@/lib/clientes";
import { nomeBeneficio } from "@/lib/constantes";
import { formatarLugar, rotuloModalidade } from "@/lib/formato";
import { MODELOS_ANUNCIO, type ModeloAnuncio } from "@/lib/modelos-anuncio";
import { lerNumeroBR } from "@/lib/numero";
import { faltaNoPasso, passoDoCampo } from "@/lib/passos-publicar";
import {
  apagarRascunho,
  CHAVE_COM_CONTA,
  formDataDoRascunho,
  guardarRascunho,
  lerRascunhoGuardado,
  valoresDoRascunho,
  type Rascunho,
} from "@/lib/rascunho-anuncio";
import { ganhosDoBanco } from "@/lib/vaga-extra";
import { BENEFICIO_CURTO, valorEmDuas } from "@/lib/valor-do-tiquete";
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

/** As partes do tíquete que um campo preenche (marcadas na prévia enquanto a pessoa escreve nele). */
type Parte = "titulo" | "regime" | "valor" | "lugar" | "resumo" | "beneficio" | "comeca" | "direto";

const PARTE_DO_CAMPO: Record<string, Parte> = {
  titulo: "titulo",
  regime: "regime",
  combinar: "valor",
  pagamento_valor: "valor",
  pagamento_ate: "valor",
  pagamento_unidade: "valor",
  cidade: "lugar",
  bairro: "lugar",
  cep: "lugar",
  endereco: "lugar",
  descricao: "resumo",
  beneficios_lista: "beneficio",
  comeca_ja: "comeca",
  contato_direto: "direto",
};

function parteDoCampo(alvo: EventTarget | null): Parte | null {
  const nome = alvo instanceof HTMLElement ? alvo.getAttribute("name") : null;
  return (nome && PARTE_DO_CAMPO[nome]) || null;
}

type Previa = {
  titulo: string;
  /** o valor grande e o que ele quer dizer ("até R$ 2.200", "por mês"), como no canhoto do tíquete */
  valor: { valor: string; partes: string[] };
  modalidade: string | null;
  lugar: string;
  /** o começo da descrição (o tíquete mostra 2 linhas) */
  resumo: string;
  beneficios: string[];
  comecaJa: boolean;
  contatoDireto: boolean;
  confidencial: boolean;
  /** os campos obrigatórios que ainda faltam (os de `faltaNoPasso`) */
  falta: string[];
};

/** A prévia antes de a pessoa escrever qualquer coisa (o título vira um texto de exemplo apagado). */
const PREVIA_VAZIA: Previa = {
  titulo: "",
  valor: { valor: "A combinar", partes: [] },
  modalidade: null,
  lugar: "",
  resumo: "",
  beneficios: [],
  comecaJa: false,
  contatoDireto: false,
  confidencial: false,
  falta: ["titulo", "regime", "pagamento_valor", "bairro"],
};

function lerPrevia(form: HTMLFormElement, agencia: boolean): Previa {
  const f = new FormData(form);
  const t = (k: string) => {
    const v = f.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const combinar = t("combinar") === "on";
  const numero = (k: string) => {
    const n = lerNumeroBR(t(k));
    return !combinar && n != null && Number.isFinite(n) && n > 0 ? n : null;
  };
  const regime = t("regime");
  return {
    titulo: t("titulo"),
    valor: valorEmDuas({
      tipo: "vaga",
      pagamento_valor: numero("pagamento_valor"),
      pagamento_ate: numero("pagamento_ate"),
      pagamento_unidade: combinar ? null : t("pagamento_unidade") || null,
    }),
    modalidade: regime && regime !== "outro" ? rotuloModalidade("vaga", regime) : null,
    lugar: t("cidade") ? formatarLugar(t("bairro") || null, t("cidade")) : "",
    resumo: t("descricao").replace(/\s+/g, " ").slice(0, 240),
    beneficios: f.getAll("beneficios_lista").filter((b): b is string => typeof b === "string" && Boolean(b)),
    comecaJa: t("comeca_ja") === "on",
    contatoDireto: t("contato_direto") === "on",
    confidencial: t("contratante_confidencial") === "on",
    // o mesmo que o Continuar de cada passo confere
    falta: [1, 2, 3].flatMap((n) => Object.keys(faltaNoPasso(n, f, { vaga: true, agencia }))),
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
  antes = null,
}: {
  /** no alto da coluna do formulário, antes dos avisos ("Procura trabalho?", "Vaga nova a partir de outra") */
  antes?: ReactNode;
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
  // a parte da prévia que o campo em foco preenche (marcada no tíquete, ao lado)
  const [foco, setFoco] = useState<Parte | null>(null);
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
      setPrevia(lerPrevia(f, agencia));
      guardarRascunho(f, chaveDoRascunho, passoAtual.current);
    }, 250);
  }
  useEffect(() => {
    const t = window.setTimeout(() => {
      const f = formulario();
      if (f) setPrevia(lerPrevia(f, agencia));
    }, 0);
    return () => window.clearTimeout(t);
  }, [chave, agencia]);

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

  // na coluna do formulário, embaixo do título e dos passos
  const avisos = (
    <>
      {antes}
      {convite && (
        <AvisoConvite token={convite.token} nome={convite.nome}>
          {convite.pronta
            ? "A vaga já veio preenchida com o anúncio de vocês. Confira, ajuste o que precisar e toque em Publicar."
            : "Escreva a vaga e toque em Publicar."}{" "}
          É grátis, sem plano e sem taxa. Para publicar, você entra com o e-mail, sem senha.
        </AvisoConvite>
      )}
      {semConta && !convite && (
        // no computador, o recado fica embaixo da prévia, ao lado (o passo cabe na tela)
        <Aviso tipo="info" titulo="Não precisa de conta para começar" className="lg:hidden">
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
    </>
  );
  const p = previa ?? PREVIA_VAZIA;
  const nome = autor || "Sua empresa";
  const comIA = ia && !semConta;
  const alternar = (qual: "modelo" | "texto" | "foto") => setAtalho((a) => (a === qual ? null : qual));

  return (
    <div
      ref={raiz}
      onInput={aoMexer}
      onChange={aoMexer}
      onFocus={(e) => setFoco(parteDoCampo(e.target))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFoco(null);
      }}
      // ao publicar, o rascunho de quem tem conta sai (se der errado, o formulário continua preenchido)
      onSubmitCapture={() => {
        if (!semConta) apagarRascunho(CHAVE_COM_CONTA);
      }}
    >
      <FormAnuncio
        key={chave}
        inicial={inicial}
        acaoSalvar={semConta ? conferirAnuncio : salvarAnuncio}
        semConta={semConta}
        aposConferir={semConta ? seguirParaEntrar : undefined}
        ia={comIA}
        agencia={agencia}
        contatoAgencia={contatoAgencia}
        clientes={clientes}
        enderecoPublico={enderecoPublico}
        titulo="Publicar grátis"
        avisos={avisos}
        // no celular, a prévia fica no passo 5; no computador, ao lado, desde o passo 1, no meio da tela
        previa={<PreviaDaVaga p={p} autor={nome} />}
        palco={({ maxPasso, irAoCampo }) => (
          <PalcoDaVaga
            p={p}
            autor={nome}
            foco={foco}
            agencia={agencia}
            semConta={semConta}
            maxPasso={maxPasso}
            irAoCampo={irAoCampo}
          />
        )}
        extras={convite ? { convite: convite.token } : undefined}
        jaMudou={aviso === "lido"}
        passos
        passoInicial={passoDeComeco}
        aoMudarPasso={aoMudarPasso}
        atalhos={
          comModelos ? (
            <div className="flex flex-col gap-2.5 border-b border-line pb-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-label">Para ir mais rápido</p>
                <p className="text-body-sm text-ink-muted">
                  Oferece serviços?{" "}
                  <Link href="/painel/servicos" className="underline underline-offset-2 hover:text-ink">
                    Monte sua vitrine
                  </Link>
                </p>
              </div>
              {/* os três do mesmo tamanho, numa linha (no celular, o ícone em cima do nome) */}
              <div className="grid grid-cols-3 gap-2">
                <Atalho
                  icone={Sparkles}
                  ativo={atalho === "modelo"}
                  empilhado={comIA}
                  onClick={() => alternar("modelo")}
                >
                  Usar modelo
                </Atalho>
                {comIA && (
                  <Atalho
                    icone={ClipboardPaste}
                    ativo={atalho === "texto"}
                    empilhado
                    novo
                    onClick={() => alternar("texto")}
                  >
                    Colar texto
                  </Atalho>
                )}
                {comIA && (
                  <Atalho icone={ImageUp} ativo={atalho === "foto"} empilhado onClick={() => alternar("foto")}>
                    Enviar foto
                  </Atalho>
                )}
              </div>
              {atalho === "modelo" && (
                <ul aria-label="Modelos de vaga" className="flex flex-wrap gap-2 rounded-md bg-surface-300 p-3">
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
              {atalho === "texto" && comIA && <TextoDaVaga aoLer={aplicarArte} />}
              {atalho === "foto" && comIA && <ArteDaVaga aoLer={(v) => aplicarArte(v)} />}
            </div>
          ) : null
        }
      />
    </div>
  );
}

/** Um atalho do passo 1 (modelo, texto ou foto): abre embaixo o que ele faz; tocar de novo fecha. */
function Atalho({
  icone: Icone,
  ativo,
  empilhado = false,
  novo = false,
  onClick,
  children,
}: {
  icone: LucideIcon;
  ativo: boolean;
  /** no celular, o ícone em cima do nome (os três cabem numa linha) */
  empilhado?: boolean;
  novo?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={ativo}
      onClick={onClick}
      className={`relative inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-label whitespace-nowrap transition-colors ${
        empilhado ? "max-sm:min-h-16 max-sm:flex-col max-sm:gap-1 max-sm:px-2" : "max-sm:col-span-3"
      } ${ativo ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-200 hover:bg-surface-300"}`}
    >
      <Icone aria-hidden className="size-[18px] shrink-0" />
      {children}
      {/* pendurado na borda, como uma etiqueta: não aperta o nome */}
      {novo && (
        <Selo variante="novo" className="absolute -top-2.5 right-2 px-2! py-0.5!">
          Novo
        </Selo>
      )}
    </button>
  );
}

// a parte que o campo em foco preenche fica marcada, como com um marca-texto amarelo (só no palco, ao lado do
// formulário; no celular, a prévia não tem a marca). No texto, a marca segue as linhas (box-decoration-clone).
const MARCA =
  "rounded-[4px] box-decoration-clone transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none";
const EM_FOCO: Record<Parte, string> = {
  titulo:
    "group-data-[foco=titulo]/palco:bg-ipe/35 group-data-[foco=titulo]/palco:shadow-[0_0_0_3px_color-mix(in_srgb,var(--pk-ipe)_35%,transparent)]",
  regime:
    "group-data-[foco=regime]/palco:bg-ipe/35! group-data-[foco=regime]/palco:shadow-[0_0_0_3px_color-mix(in_srgb,var(--pk-ipe)_35%,transparent)]",
  valor:
    "group-data-[foco=valor]/palco:bg-ipe/35 group-data-[foco=valor]/palco:shadow-[0_0_0_4px_color-mix(in_srgb,var(--pk-ipe)_35%,transparent)]",
  lugar:
    "group-data-[foco=lugar]/palco:bg-ipe/35 group-data-[foco=lugar]/palco:shadow-[0_0_0_3px_color-mix(in_srgb,var(--pk-ipe)_35%,transparent)]",
  // sem a borda a mais: cortado em 2 linhas, a borda da 3ª aparecia embaixo
  resumo: "group-data-[foco=resumo]/palco:bg-ipe/35",
  beneficio:
    "group-data-[foco=beneficio]/palco:bg-ipe/35! group-data-[foco=beneficio]/palco:shadow-[0_0_0_3px_color-mix(in_srgb,var(--pk-ipe)_35%,transparent)]",
  comeca:
    "group-data-[foco=comeca]/palco:bg-ipe/35! group-data-[foco=comeca]/palco:shadow-[0_0_0_3px_color-mix(in_srgb,var(--pk-ipe)_35%,transparent)]",
  direto:
    "group-data-[foco=direto]/palco:bg-ipe/35! group-data-[foco=direto]/palco:shadow-[0_0_0_3px_color-mix(in_srgb,var(--pk-ipe)_35%,transparent)]",
};

/**
 * O tíquete da vaga como na linha do tempo (TicketDaVaga, home/linha/objetos.tsx), com o que já foi escrito:
 * o mesmo picote, o valor no canhoto e as etiquetas numa linha. No celular, o canhoto desce, como lá.
 */
function TiqueteDaPrevia({ p, autor }: { p: Previa; autor: string }) {
  // as etiquetas como lá: com o "Começa já" ou o "Contato direto", os benefícios ficam todos no "+N"
  const beneficios = p.beneficios.slice(0, p.comecaJa || p.contatoDireto ? 0 : 1);
  const outros = p.beneficios.length - beneficios.length;
  return (
    <article className="tiquete grid min-w-0 grid-rows-[auto_var(--canhoto)] [--tom:var(--pk-tom-vaga)] sm:grid-cols-[minmax(0,1fr)_var(--canhoto)] sm:grid-rows-1 sm:rounded-lg">
      <span aria-hidden className="tiquete-fundo" />
      <span aria-hidden className="tiquete-picote" />
      <div className="flex min-w-0 gap-3 p-3.5 sm:px-4 sm:py-3.5">
        <Avatar nome={autor} tamanho={40} forma="quadrada" colorida />
        <div className="min-w-0 flex-1">
          <p
            className={`font-display text-[17px] leading-[22px] font-bold tracking-[-0.01em] break-words sm:text-[19px] sm:leading-6 ${
              p.titulo ? "" : "text-ink-muted/70"
            }`}
          >
            <span className={`${MARCA} ${EM_FOCO.titulo}`}>{p.titulo || "O título da vaga aparece aqui"}</span>
          </p>
          <p className="truncate text-body-sm font-semibold">{autor}</p>
          {p.resumo && (
            <p className="mt-1 line-clamp-2 text-body-sm text-ink/80">
              <span className={`${MARCA} ${EM_FOCO.resumo}`}>{p.resumo}</span>
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-body-sm text-ink-muted">
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-4 shrink-0 text-terra-text" />
              <span className={`${MARCA} ${EM_FOCO.lugar}`}>{p.lugar || "O bairro aparece aqui"}</span>
            </span>
            <ul className="flex flex-wrap items-center gap-1.5 text-ink [&>li]:rounded-pill [&>li]:bg-surface-100 [&>li]:px-2.5 [&>li]:py-0.5 [&>li]:text-[13px] [&>li]:leading-[18px] [&>li]:font-semibold [&>li]:whitespace-nowrap">
              {p.modalidade ? (
                <li className={`${MARCA} ${EM_FOCO.regime}`}>{p.modalidade}</li>
              ) : (
                // ainda sem o tipo: no foco do campo, o lugar dele aparece marcado
                <li
                  aria-hidden
                  className={`hidden text-ink-muted group-data-[foco=regime]/palco:block ${MARCA} ${EM_FOCO.regime}`}
                >
                  Tipo de contratação
                </li>
              )}
              {p.comecaJa && (
                <li
                  className={`inline-flex items-center gap-1 bg-terra-soft! text-terra-text ${MARCA} ${EM_FOCO.comeca}`}
                >
                  <CalendarClock aria-hidden className="size-3.5" />
                  Começa já
                </li>
              )}
              {p.contatoDireto && (
                <li className={`inline-flex items-center gap-1 text-cerrado-text ${MARCA} ${EM_FOCO.direto}`}>
                  <Zap aria-hidden className="size-3.5" />
                  Contato direto
                </li>
              )}
              {beneficios.map((b) => (
                <li key={b} className={`${MARCA} ${EM_FOCO.beneficio}`}>
                  {BENEFICIO_CURTO[b] ?? nomeBeneficio(b) ?? b}
                </li>
              ))}
              {outros > 0 && <li className={`${MARCA} ${EM_FOCO.beneficio}`}>+{outros}</li>}
            </ul>
          </div>
        </div>
      </div>
      {/* o canhoto: o valor e o Curtir */}
      <div className="flex items-center justify-between gap-3 px-3.5 sm:flex-col sm:items-stretch sm:justify-center sm:gap-2.5 sm:p-3.5 sm:pl-5">
        <p className={`flex items-baseline gap-1.5 sm:flex-col sm:gap-0 ${MARCA} ${EM_FOCO.valor}`}>
          <span
            className={`font-display font-extrabold tracking-[-0.02em] whitespace-nowrap tabular-nums ${
              p.valor.partes.length
                ? "text-[20px] leading-6 sm:text-[22px] sm:leading-[26px]"
                : "text-[17px] leading-6 sm:text-[18px]"
            }`}
          >
            {p.valor.valor}
          </span>
          {p.valor.partes.length > 0 && (
            <span className="text-body-sm text-ink-muted sm:leading-[18px]">
              {p.valor.partes.map((x, i) => (
                <span key={x} className="sm:block">
                  {i > 0 && <span className="sm:hidden"> · </span>}
                  {x}
                </span>
              ))}
            </span>
          )}
        </p>
        <span className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-pill border border-line-strong bg-surface-200 px-4 text-label whitespace-nowrap">
          <Heart aria-hidden className="size-4" />
          Curtir
        </span>
      </div>
    </article>
  );
}

/** No celular (passo 5): o tíquete com o que já foi escrito. */
function PreviaDaVaga({ p, autor }: { p: Previa; autor: string }) {
  return (
    <section aria-label="Prévia da vaga" className="flex flex-col gap-2">
      <p className="text-label text-ink-muted">Assim sua vaga aparece</p>
      <TiqueteDaPrevia p={p} autor={autor} />
    </section>
  );
}

/** O que a vaga precisa para publicar (o resto é opcional), na ordem dos passos. */
const PARA_PUBLICAR = [
  { campo: "titulo", nome: "Título", chaves: ["titulo"] },
  { campo: "contratante", nome: "Empresa", chaves: ["contratante"] },
  { campo: "regime", nome: "Tipo de contratação", chaves: ["regime"] },
  { campo: "pagamento_valor", nome: "Valor", chaves: ["pagamento_valor", "pagamento_unidade", "pagamento_ate"] },
  { campo: "bairro", nome: "Bairro", chaves: ["bairro"] },
] as const;

/**
 * No computador, ao lado do formulário, da altura da tela: a vaga no meio, como aparece na linha do tempo
 * (com o traço, o nó e outros anúncios apagados em volta), marcando a parte que o campo em foco preenche;
 * embaixo, o que falta para publicar (tocar leva ao campo) e o que fica escondido.
 */
function PalcoDaVaga({
  p,
  autor,
  foco,
  agencia,
  semConta,
  maxPasso,
  irAoCampo,
}: {
  p: Previa;
  autor: string;
  foco: Parte | null;
  agencia: boolean;
  semConta: boolean;
  maxPasso: number;
  irAoCampo: (campo: string) => void;
}) {
  const itens = PARA_PUBLICAR.filter((i) =>
    i.campo === "contratante" ? agencia : i.campo === "bairro" ? !p.confidencial : true,
  );
  const falta = new Set(p.falta);
  const pronto = (i: (typeof itens)[number]) => !i.chaves.some((c) => falta.has(c));
  const feitos = itens.filter(pronto).length;
  return (
    <section
      aria-label="Prévia da vaga"
      data-foco={foco ?? undefined}
      className="group/palco grid h-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-lg border border-line bg-surface-300"
    >
      <div className="px-5 pt-4 xl:px-6 xl:pt-5">
        <p className="text-label">Assim sua vaga aparece</p>
        <p className="text-body-sm text-ink-muted">Na linha do tempo de quem mora perto.</p>
      </div>
      <div className="relative min-h-0">
        {/* o traço da linha do tempo, que passa pelos nós (como na home) */}
        <span aria-hidden className="absolute inset-y-0 left-10 hidden w-0.5 -translate-x-1/2 bg-line xl:block" />
        <div className="absolute inset-0 grid grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 px-5 py-3 xl:px-6">
          <div className="flex min-h-0 flex-col justify-end overflow-hidden">
            <Fantasma tom="servico" className="opacity-35" />
          </div>
          <div className="grid items-start xl:grid-cols-[32px_minmax(0,1fr)] xl:gap-x-3">
            <span
              aria-hidden
              className="relative z-[1] mt-2.5 hidden size-8 place-items-center rounded-pill bg-tom-vaga text-terra-text shadow-[0_0_0_4px_var(--pk-surface-300)] xl:grid"
            >
              <Briefcase className="size-4" />
            </span>
            <TiqueteDaPrevia p={p} autor={autor} />
          </div>
          <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
            <Fantasma tom="vaga" className="opacity-50" />
            <Fantasma tom="vaga" className="opacity-25" />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 border-t border-line px-5 py-4 xl:px-6">
        <div className="flex items-center justify-between gap-3">
          {feitos === itens.length ? (
            <p className="flex items-center gap-1.5 text-label text-cerrado-text">
              <CircleCheck aria-hidden className="size-4" />
              Pronto para publicar
            </p>
          ) : (
            <p className="text-label">Para publicar</p>
          )}
          <p className="text-body-sm text-ink-muted tabular-nums">
            {feitos} de {itens.length}
          </p>
        </div>
        <ul aria-label="O que a vaga precisa para publicar" className="flex flex-wrap gap-1.5">
          {itens.map((i) => {
            const ok = pronto(i);
            // só leva aos passos já abertos (os outros chegam pelo Continuar)
            const aberto = passoDoCampo(i.campo) <= maxPasso;
            const classes = `inline-flex min-h-8 items-center gap-1.5 rounded-pill border px-3 text-label ${
              ok ? "border-transparent bg-surface-200 text-ink" : "border-dashed border-line-strong text-ink-muted"
            }`;
            const conteudo = (
              <>
                {ok ? (
                  <Check aria-hidden className="size-4 text-cerrado-text" />
                ) : (
                  <Circle aria-hidden className="size-3" />
                )}
                {i.nome}
                <span className="sr-only">{ok ? " (pronto)" : " (falta)"}</span>
              </>
            );
            return (
              <li key={i.campo}>
                {aberto ? (
                  <button
                    type="button"
                    onClick={() => irAoCampo(i.campo)}
                    className={`${classes} transition-colors hover:border-ink hover:text-ink`}
                  >
                    {conteudo}
                  </button>
                ) : (
                  <span className={classes}>{conteudo}</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="flex items-start gap-2 text-body-sm text-ink-muted">
          <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
          {p.contatoDireto
            ? "Com o contato direto, quem curtir a vaga já vê seu WhatsApp."
            : "Grátis e sem limite de candidatos. Seu WhatsApp só aparece para quem você aceitar."}
        </p>
        {semConta && (
          <p className="text-body-sm text-ink-muted">
            Sem conta, tudo bem: no fim, é só entrar com {jeitosDeEntrar()}. O que você escreve fica guardado neste
            aparelho.
          </p>
        )}
      </div>
    </section>
  );
}

/** Outro anúncio da linha, apagado (só a forma: o palco mostra onde a vaga entra, entre as outras). */
function Fantasma({ tom, className }: { tom: "vaga" | "servico"; className: string }) {
  return (
    <div aria-hidden className={`grid items-start xl:grid-cols-[32px_minmax(0,1fr)] xl:gap-x-3 ${className}`}>
      <span
        className={`relative z-[1] mt-2.5 hidden size-8 rounded-pill shadow-[0_0_0_4px_var(--pk-surface-300)] xl:block ${
          tom === "vaga" ? "bg-tom-vaga" : "bg-tom-servico"
        }`}
      />
      <div
        className={`tiquete grid grid-cols-[minmax(0,1fr)_var(--canhoto)] rounded-lg ${
          tom === "vaga" ? "[--tom:var(--pk-tom-vaga)]" : "[--tom:var(--pk-tom-servico)]"
        }`}
      >
        <span className="tiquete-fundo" />
        <span className="tiquete-picote" />
        <div className="flex gap-3 px-4 py-3.5">
          <span className="size-10 shrink-0 rounded-[11px] bg-surface-300" />
          <span className="flex min-w-0 flex-1 flex-col gap-2 pt-0.5">
            <span className="h-3.5 w-4/5 rounded-pill bg-surface-300" />
            <span className="h-3 w-1/2 rounded-pill bg-surface-300" />
            <span className="h-3 w-3/5 rounded-pill bg-surface-300" />
          </span>
        </div>
        <div className="flex flex-col justify-center gap-2.5 p-3.5 pl-5">
          <span className="h-4 w-3/4 rounded-pill bg-ink/10" />
          <span className="h-9 rounded-pill border border-line-strong/40" />
        </div>
      </div>
    </div>
  );
}
