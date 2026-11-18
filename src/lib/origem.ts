// De qual campanha a pessoa chegou: o link do anúncio leva ?utm_source=google&utm_campaign=servicos.
// O site guarda só "google:servicos" num cookie próprio por 7 dias e, quando a pessoa cria a conta
// (por qualquer jeito de entrar: celular, e-mail, Google...), grava no banco (registrar_origem).
// Anúncio do Google sem utm (só a marcação automática, ?gclid=...): "google-ads", com o número da
// campanha quando o Google manda (gad_campaignid). Nada vai para fora; o admin vê em /admin/campanhas.

export const COOKIE_ORIGEM = "publike_origem";
export const DURACAO_ORIGEM = 60 * 60 * 24 * 7;

const FORMATO = /^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$/;

/** "Google Ads" → "google-ads": minúsculas, sem acento, só letras, números, - e _. */
function parte(valor: string | null) {
  if (!valor) return "";
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

/** O clique veio de um anúncio do Google (marcação automática do Google Ads). */
function anuncioDoGoogle(params: URLSearchParams) {
  return params.has("gclid") || params.has("gbraid") || params.has("wbraid");
}

/**
 * A origem do link (utm_source e utm_campaign), ou null se o link não tem campanha. Sem utm, o
 * anúncio do Google entra como "google-ads" (com o número da campanha, se vier).
 */
export function origemDoLink(params: URLSearchParams): string | null {
  const google = anuncioDoGoogle(params);
  const fonte = parte(params.get("utm_source")) || (google ? "google-ads" : "");
  const campanha = parte(params.get("utm_campaign")) || (google ? parte(params.get("gad_campaignid")) : "");
  const origem = fonte && campanha ? `${fonte}:${campanha}` : fonte || (campanha ? `campanha:${campanha}` : "");
  return origemValida(origem) ? origem : null;
}

export function origemValida(origem: string | null | undefined): origem is string {
  return typeof origem === "string" && FORMATO.test(origem);
}

/**
 * O link com a origem para o Admin › Campanhas ("compartilhar:pagina"): põe utm_source e utm_campaign se o link ainda
 * não tem. Os botões de compartilhar usam utm_source=compartilhar e, em utm_campaign, o que foi compartilhado (anuncio,
 * banner, pagina, post), como os de antes.
 */
export function comOrigem(link: string, fonte: string, campanha: string) {
  try {
    const u = new URL(link);
    if (!u.searchParams.has("utm_source")) {
      u.searchParams.set("utm_source", fonte);
      u.searchParams.set("utm_campaign", campanha);
    }
    return u.toString();
  } catch {
    return link;
  }
}


// O orgânico (18/11/2026, claude/plano-organico.md): quem chega sem campanha no link também diz de onde veio. Na
// primeira página aberta inteira, o site guarda por 7 dias, em cookies próprios, só o nome do canal e o caminho da
// página (nada da pessoa): de onde veio (`publike_chegada`, pelo referer: "busca:google", "ia:perplexity",
// "rede:instagram", "whatsapp", "site:sine_go_gov_br" ou "direto", quando não veio referer) e a página de entrada
// (`publike_entrada`). A conta nova grava os dois em privado.origens (`chegada` e `entrada`); a campanha do link
// (`publike_origem`) continua em `origem` e vale primeiro nas tabelas do admin.

export const COOKIE_CHEGADA = "publike_chegada";
export const COOKIE_ENTRADA = "publike_entrada";

/** Os domínios que dizem o canal (vale o primeiro que bate; os mais específicos vêm antes do Google e do Yahoo). */
const CANAIS_DO_REFERER: [RegExp, string][] = [
  [/(^|\.)(gemini|bard)\.google\.com$/, "ia:gemini"],
  [/(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com)$/, "ia:chatgpt"],
  [/(^|\.)perplexity\.ai$/, "ia:perplexity"],
  [/(^|\.)copilot\.microsoft\.com$/, "ia:copilot"],
  [/(^|\.)claude\.ai$/, "ia:claude"],
  [/(^|\.)meta\.ai$/, "ia:meta"],
  [/(^|\.)deepseek\.com$/, "ia:deepseek"],
  [/(^|\.)(grok\.com|x\.ai)$/, "ia:grok"],
  [/(^|\.)mail\.google\.com$/, "email:gmail"],
  [/(^|\.)outlook\.(live|office|office365)\.com$/, "email:outlook"],
  [/(^|\.)mail\.yahoo\.com$/, "email:yahoo"],
  [/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/, "busca:google"],
  [/(^|\.)bing\.com$/, "busca:bing"],
  [/(^|\.)duckduckgo\.com$/, "busca:duckduckgo"],
  [/(^|\.)yahoo\.com$/, "busca:yahoo"],
  [/(^|\.)ecosia\.org$/, "busca:ecosia"],
  [/(^|\.)search\.brave\.com$/, "busca:brave"],
  [/(^|\.)yandex\.[a-z]{2,3}$/, "busca:yandex"],
  [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, "rede:facebook"],
  [/(^|\.)instagram\.com$/, "rede:instagram"],
  [/(^|\.)(t\.co|twitter\.com|x\.com)$/, "rede:x"],
  [/(^|\.)(linkedin\.com|lnkd\.in)$/, "rede:linkedin"],
  [/(^|\.)(youtube\.com|youtu\.be)$/, "rede:youtube"],
  [/(^|\.)tiktok\.com$/, "rede:tiktok"],
  [/(^|\.)threads\.(net|com)$/, "rede:threads"],
  [/(^|\.)pinterest\.[a-z]{2,3}(\.[a-z]{2})?$/, "rede:pinterest"],
  [/(^|\.)kwai\.com$/, "rede:kwai"],
  [/(^|\.)(whatsapp\.com|wa\.me)$/, "whatsapp"],
  [/(^|\.)(t\.me|telegram\.org|telegram\.me)$/, "telegram"],
];

/** Os apps do Android que abrem o link (o referer vem como android-app://pacote). */
const CANAIS_DO_APP: Record<string, string> = {
  "com.google.android.googlequicksearchbox": "busca:google",
  "com.google.android.gm": "email:gmail",
  "com.google.android.apps.bard": "ia:gemini",
  "com.openai.chatgpt": "ia:chatgpt",
  "com.whatsapp": "whatsapp",
  "com.whatsapp.w4b": "whatsapp",
  "com.instagram.android": "rede:instagram",
  "com.facebook.katana": "rede:facebook",
  "com.facebook.lite": "rede:facebook",
  "com.facebook.orca": "rede:facebook",
  "com.linkedin.android": "rede:linkedin",
  "com.google.android.youtube": "rede:youtube",
  "com.zhiliaoapp.musically": "rede:tiktok",
  "org.telegram.messenger": "telegram",
};

/** Quem só passa pela volta do login ou do pagamento: não é de onde a pessoa veio. */
const SO_DE_PASSAGEM =
  /(^|\.)(accounts\.google\.com|accounts\.youtube\.com|supabase\.co|appleid\.apple\.com|login\.microsoftonline\.com|login\.live\.com|asaas\.com|vercel\.app|vercel\.com)$/;

/** "sine.go.gov.br" → "sine_go_gov_br" (o ponto vira _, que não existe em nome de site; o - continua -). */
function nomeDeSite(host: string) {
  return parte(host.replace(/\./g, "_"));
}

/**
 * De onde veio quem chegou sem campanha no link, pelo referer da página. null: o próprio Publike (o site e o app) ou
 * uma volta de login; sem referer, quem chama decide ("direto"). O que não está na lista vira "site:<domínio>" (os
 * links de outros sites) ou "app:<pacote>" (um app do Android).
 */
export function origemDoReferer(referer: string | null | undefined, hostDoSite?: string | null): string | null {
  if (!referer) return null;
  if (referer.startsWith("android-app://")) {
    const pacote = referer.slice("android-app://".length).split(/[/?#]/)[0].toLowerCase();
    if (!pacote || pacote.startsWith("org.publike")) return null;
    const canal = CANAIS_DO_APP[pacote] ?? `app:${nomeDeSite(pacote)}`;
    return origemValida(canal) ? canal : null;
  }
  let host: string;
  try {
    host = new URL(referer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  const site = (hostDoSite ?? "").toLowerCase().replace(/^www\./, "").split(":")[0];
  if (!host || host === site || host === "publike.org" || host.endsWith(".publike.org") || host === "localhost") {
    return null;
  }
  if (host === "127.0.0.1" || SO_DE_PASSAGEM.test(host)) return null;
  const achado = CANAIS_DO_REFERER.find(([r]) => r.test(host));
  const canal = achado ? achado[1] : `site:${nomeDeSite(host)}`;
  return origemValida(canal) ? canal : null;
}

// As páginas públicas guardam o caminho inteiro (a vaga, a função na cidade, o artigo); nas outras, só o começo
// ("/convite/*", "/perfil/*"): os links de convite, de acesso e de indicação levam um código que não pode ir para o
// banco, e o perfil é de uma pessoa.
const CAMINHO_INTEIRO = /^\/(anuncio|vagas|servicos|conteudos|noticias|calculadora-rescisao|ajuda|v|empresas)(\/|$)/;
export const FORMATO_DA_ENTRADA = /^\/[A-Za-z0-9/_.~%*-]{0,199}$/;

/** O caminho da página de entrada, sem a busca (até 200 letras); null se não for um caminho comum. */
export function entradaDoCaminho(caminho: string | null | undefined): string | null {
  if (!caminho || !caminho.startsWith("/")) return null;
  let limpo = caminho.split(/[?#]/)[0].replace(/\/{2,}/g, "/");
  if (limpo.length > 1) limpo = limpo.replace(/\/+$/, "");
  if (!CAMINHO_INTEIRO.test(limpo)) {
    const [, primeiro, resto] = /^\/([^/]*)(\/.*)?$/.exec(limpo) ?? [];
    limpo = resto ? `/${primeiro}/*` : `/${primeiro ?? ""}`;
  }
  limpo = limpo.slice(0, 200);
  return FORMATO_DA_ENTRADA.test(limpo) ? limpo : null;
}

/**
 * A campanha, a chegada e a entrada que vão no link de volta do e-mail de entrar (/auth/callback → /auth/confirmar →
 * /auth/continuar), para quem abre o e-mail em outro navegador: só os valores no formato certo.
 */
export function origemDoLinkDeVolta(ler: (nome: string) => string | null | undefined): [string, string][] {
  const pares: [string, string][] = [];
  for (const nome of ["origem", "chegada"]) {
    const v = ler(nome);
    if (origemValida(v)) pares.push([nome, v]);
  }
  const entrada = ler("entrada");
  if (entrada && FORMATO_DA_ENTRADA.test(entrada)) pares.push(["entrada", entrada]);
  return pares;
}

/**
 * O que guardar ao abrir uma página inteira, sem conta (o proxy chama). A chegada: a primeira de 7 dias, mas o
 * "direto" (sem referer: o endereço digitado, o app de mensagem que não manda de onde veio) dá lugar a um canal que
 * aparecer depois. A entrada acompanha o que vai valer no cadastro: a primeira página, ou a desta visita quando ela
 * traz a primeira campanha ou troca o "direto" por um canal.
 */
export function chegadaDaPagina(p: {
  /** a campanha deste link (origemDoLink) */
  campanha: string | null;
  /** já tem o cookie da campanha */
  temCampanha: boolean;
  /** o cookie da chegada, se tem */
  chegada: string | undefined;
  /** já tem o cookie da entrada */
  temEntrada: boolean;
  referer: string | null;
  host: string | null;
  caminho: string;
}): { chegada?: string; entrada?: string } {
  const novaCampanha = Boolean(p.campanha) && !p.temCampanha;
  let chegada: string | undefined;
  if (!p.campanha) {
    const canal = p.referer ? origemDoReferer(p.referer, p.host) : "direto";
    if (canal && (!p.chegada || (p.chegada === "direto" && canal !== "direto"))) chegada = canal;
  }
  const entrada =
    !p.temEntrada || novaCampanha || (chegada && !p.temCampanha) ? (entradaDoCaminho(p.caminho) ?? undefined) : undefined;
  return { ...(chegada ? { chegada } : {}), ...(entrada ? { entrada } : {}) };
}

/** Os canais das tabelas do admin, na ordem em que aparecem. */
export const CANAIS = [
  "busca",
  "ia",
  "vagas_google",
  "portais",
  "redes",
  "whatsapp",
  "email",
  "compartilhamentos",
  "sites",
  "pago",
  "outros",
  "direto",
  "sem_registro",
] as const;
export type CanalDaOrigem = (typeof CANAIS)[number];

export const NOME_DO_CANAL: Record<CanalDaOrigem, string> = {
  busca: "Busca (Google, Bing e outras)",
  ia: "IAs (ChatGPT, Gemini e outras)",
  vagas_google: "Google Vagas",
  portais: "Portais de vagas",
  redes: "Redes sociais",
  whatsapp: "WhatsApp e Telegram",
  email: "E-mail",
  compartilhamentos: "Compartilhamentos e convites",
  sites: "Links de outros sites e apps",
  pago: "Anúncios pagos",
  outros: "Outras campanhas",
  direto: "Direto (digitou o endereço ou o app não disse de onde)",
  sem_registro: "Sem registro (contas de antes de 18/11 ou sem cookie)",
};

/**
 * O canal de cada origem. A campanha do link: utm_source=google (os anúncios e os impulsos) e o gclid são pagos; o
 * ChatGPT põe utm_source=chatgpt.com nos links que cita ("chatgptcom"); o Google Vagas, utm_source=google_jobs_apply;
 * os portais recebem o feed (campanha "feed"). Os compartilhamentos (compartilhar:*, convite:*, *:indicacao e as
 * empresas divulgando as próprias vagas, *:vagas-empresa) vêm antes da rede por onde passaram. O resto, do referer.
 */
export function canalDaOrigem(origem: string): CanalDaOrigem {
  if (origem === "direto") return "direto";
  if (origem === "sem-registro") return "sem_registro";
  const [fonte, campanha = ""] = origem.split(":");
  if (fonte === "busca") return "busca";
  if (fonte === "ia" || fonte.startsWith("chatgpt") || ["perplexity", "copilot", "gemini"].includes(fonte)) return "ia";
  if (fonte.startsWith("google_jobs") || fonte.startsWith("google-jobs")) return "vagas_google";
  if (campanha === "feed") return "portais";
  if (
    fonte === "compartilhar" ||
    fonte === "convite" ||
    fonte === "indicacao" ||
    ["indicacao", "compartilhar", "vagas-empresa"].includes(campanha)
  ) {
    return "compartilhamentos";
  }
  if (["google", "google-ads", "gads", "adwords", "meta-ads", "cpc"].includes(fonte)) return "pago";
  if (["rede", "instagram", "ig", "facebook", "fb", "linkedin", "tiktok", "youtube", "post"].includes(fonte)) {
    return "redes";
  }
  if (fonte === "whatsapp" || fonte === "wa" || fonte === "telegram") return "whatsapp";
  if (fonte === "email") return "email";
  if (fonte === "site" || fonte === "app" || fonte === "site-empresa") return "sites";
  return "outros";
}

const NOMES_DAS_ORIGENS: Record<string, string> = {
  direto: "Direto",
  "sem-registro": "Sem registro",
  "busca:google": "Busca do Google",
  "busca:bing": "Busca do Bing",
  "busca:duckduckgo": "DuckDuckGo",
  "busca:yahoo": "Busca do Yahoo",
  "ia:chatgpt": "ChatGPT (sem o utm)",
  chatgptcom: "ChatGPT",
  "ia:gemini": "Gemini",
  "ia:perplexity": "Perplexity",
  "ia:copilot": "Copilot",
  "ia:claude": "Claude",
  "ia:meta": "Meta AI",
  "ia:deepseek": "DeepSeek",
  "ia:grok": "Grok",
  "rede:instagram": "Instagram",
  "rede:facebook": "Facebook",
  "rede:linkedin": "LinkedIn",
  "rede:youtube": "YouTube",
  "rede:tiktok": "TikTok",
  "rede:x": "X (Twitter)",
  "rede:threads": "Threads",
  "rede:kwai": "Kwai",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  "email:gmail": "Gmail",
  "email:outlook": "Outlook",
  "email:yahoo": "Yahoo Mail",
  "email:indicacao": "E-mail de indicação",
  "instagram:bio": "Instagram do Publike (bio)",
  "instagram:stories": "Instagram do Publike (stories)",
  "whatsapp:atendimento": "Atendimento pelo WhatsApp",
  "whatsapp:indicacao": "Indicação pelo WhatsApp",
  "whatsapp:compartilhar": "Vaga compartilhada no WhatsApp",
  "convite:candidato": "Convite da empresa ao candidato",
  "site-empresa:vagas": "Quadro de vagas no site da empresa",
};

/** O nome de cada origem nas tabelas ("Busca do Google", "ChatGPT", "Site: sine.go.gov.br"); o resto, como veio. */
export function nomeDaOrigem(origem: string): string {
  if (NOMES_DAS_ORIGENS[origem]) return NOMES_DAS_ORIGENS[origem];
  const [fonte, resto = ""] = origem.split(":");
  if (fonte === "site") return `Site: ${resto.replace(/_/g, ".")}`;
  if (fonte === "app") return `App: ${resto.replace(/_/g, ".")}`;
  if (fonte === "busca") return `Busca: ${resto}`;
  if (fonte === "ia") return `IA: ${resto}`;
  if (fonte.startsWith("google_jobs")) return "Google Vagas";
  if (resto === "feed") return `Portal: ${fonte}`;
  if (fonte === "compartilhar") return `Compartilhado: ${resto || "link"}`;
  if (resto === "vagas-empresa") return `Empresa divulgando as vagas (${fonte})`;
  if (fonte === "whatsapp" && resto.startsWith("aviso-")) return "Aviso do Publike no WhatsApp";
  if (fonte === "google-ads") return resto ? `Google Ads (campanha ${resto})` : "Google Ads";
  if (fonte === "google") return `Google Ads: ${resto || "sem nome"}`;
  return origem;
}

/** Os tipos de página de entrada, na ordem das tabelas. */
export const ENTRADAS = [
  "vaga",
  "funcao",
  "cidade",
  "bairro",
  "recentes",
  "servicos",
  "inicio",
  "ferramenta",
  "conteudo",
  "empresas",
  "perfis",
  "convites",
  "entrar",
  "outras",
] as const;
export type TipoDeEntrada = (typeof ENTRADAS)[number];

export const NOME_DA_ENTRADA: Record<TipoDeEntrada, string> = {
  vaga: "Página de uma vaga",
  funcao: "Vagas de uma função ou área (/vagas/cidade/frentista)",
  cidade: "Vagas de uma cidade (/vagas/goiania)",
  bairro: "Vagas de um bairro",
  recentes: "Vagas de hoje, novas, estágio e aprendiz",
  servicos: "Serviços e profissionais",
  inicio: "Página inicial",
  ferramenta: "Ferramentas (currículo, rescisão, seguro, quem contrata)",
  conteudo: "Artigos e notícias",
  empresas: "Para empresas e publicar",
  perfis: "Perfis, páginas das empresas e posts",
  convites: "Links de convite e de indicação",
  entrar: "Página de entrar",
  outras: "Outras páginas",
};

/** O tipo da página de entrada (o caminho já guardado, com "*" no lugar do código). */
export function tipoDaEntrada(caminho: string | null | undefined): TipoDeEntrada {
  const c = (caminho ?? "").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (c === "/") return "inicio";
  if (/^\/anuncio\//.test(c)) return "vaga";
  if (/^\/vagas\/[^/]+\/bairro(\/|$)/.test(c)) return "bairro";
  if (/^\/vagas\/[^/]+\/(hoje|ultimos-3-dias|estagio-e-jovem-aprendiz)$/.test(c)) return "recentes";
  if (/^\/vagas\/[^/]+\/[^/]+$/.test(c)) return "funcao";
  if (/^\/vagas(\/[^/]+)?$/.test(c)) return "cidade";
  if (/^\/(servicos|profissionais|vitrine)(\/|$)/.test(c)) return "servicos";
  if (/^\/(curriculo-simples|calculadora-rescisao|seguro-desemprego|quem-contrata-perto)(\/|$)/.test(c)) {
    return "ferramenta";
  }
  if (/^\/(conteudos|noticias)(\/|$)/.test(c)) return "conteudo";
  if (/^\/(empresas|gratis|publicar|como-funciona|desenvolvedores)(\/|$)/.test(c)) return "empresas";
  if (/^\/(perfil|talentos|post|cv|v)(\/|$)/.test(c)) return "perfis";
  if (/^\/(convite|candidatura|indicacao|acesso|equipe|cliente|mutirao|garantia|finalistas|relatorio)(\/|$)/.test(c)) {
    return "convites";
  }
  if (/^\/entrar(\/|$)/.test(c)) return "entrar";
  return "outras";
}
