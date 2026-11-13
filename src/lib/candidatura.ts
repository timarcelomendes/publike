// A vaga com candidatura no site da empresa (migração 20270513120000; claude/plano-candidatura-no-site-da-empresa.md).
// A vaga aparece no Publike como qualquer outra, mas o Curtir vira "Candidatar no site da empresa", que leva ao link
// da vaga no sistema de recrutamento dela (Gupy, Inhire, Sólides...). As regras valem no navegador e no servidor; o
// banco confere de novo (privado.anuncio_candidatura).

export type Candidatura = "publike" | "site";

/**
 * Os sites de vaga que quem publica pode usar, com o nome para mostrar. A mesma lista do banco:
 * privado.site_de_candidatura_aceito (a equipe, pelo admin, usa qualquer site com https).
 */
export const SITES_DE_CANDIDATURA: Readonly<Record<string, string>> = {
  "gupy.io": "Gupy",
  "gupy.com.br": "Gupy",
  "inhire.app": "Inhire",
  "kenoby.com": "Kenoby",
  "solides.jobs": "Sólides",
  "solides.com.br": "Sólides",
  "recrutei.com.br": "Recrutei",
  "pandape.com.br": "Pandapé",
  "abler.com.br": "Abler",
  "quickin.io": "Quickin",
  "taqe.com.br": "Taqe",
  "99jobs.com": "99jobs",
  "empregare.com": "Empregare",
  "selecty.com.br": "Selecty",
  "vagas.com.br": "Vagas.com",
  "factorialhr.com": "Factorial",
  "factorialhr.com.br": "Factorial",
  "greenhouse.io": "Greenhouse",
  "lever.co": "Lever",
  "workable.com": "Workable",
  "myworkdayjobs.com": "Workday",
  "smartrecruiters.com": "SmartRecruiters",
  "teamtailor.com": "Teamtailor",
  "recruitee.com": "Recruitee",
  "bamboohr.com": "BambooHR",
  "breezy.hr": "Breezy",
  "jobvite.com": "Jobvite",
};

/** Os nomes que o formulário cita como exemplo. */
export const EXEMPLOS_DE_SITES = "Gupy, Inhire, Sólides, Recrutei, Pandapé";

/** O tamanho máximo do link (o banco confere o mesmo). */
export const MAX_LINK_CANDIDATURA = 500;

/** O endereço do site ("nutriex.gupy.io"), em letra minúscula; null quando não é um link https que dá para abrir. */
export function hostDoLink(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const u = new URL(link.trim());
    if (u.protocol !== "https:" || !u.hostname.includes(".")) return null;
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** O site de vaga conhecido do link ("gupy.io"), ou null (o site da própria empresa). */
function siteConhecido(host: string): string | null {
  for (const site of Object.keys(SITES_DE_CANDIDATURA)) {
    if (host === site || host.endsWith(`.${site}`)) return site;
  }
  return null;
}

/** O link é de um site de vaga que quem publica pode usar. */
export function siteDeCandidaturaAceito(link: string | null | undefined): boolean {
  const host = hostDoLink(link);
  return host !== null && siteConhecido(host) !== null;
}

/** O nome do site de vaga ("Gupy"), ou null quando é o site da própria empresa. */
export function nomeDoSiteDeCandidatura(link: string | null | undefined): string | null {
  const host = hostDoLink(link);
  const site = host ? siteConhecido(host) : null;
  return site ? (SITES_DE_CANDIDATURA[site] ?? null) : null;
}

export type LeituraDoLink = { ok: true; link: string } | { ok: false; erro: string };

/**
 * Confere o link colado no formulário: https, sem usuário e senha no endereço e, para quem publica, de um site de vaga
 * conhecido (a equipe usa qualquer site). Devolve o link limpo (como o navegador escreve).
 */
export function lerLinkDeCandidatura(valor: string | null | undefined, { equipe = false } = {}): LeituraDoLink {
  const bruto = (valor ?? "").trim();
  if (!bruto) return { ok: false, erro: "Cole o link da vaga no site da empresa." };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(bruto) ? bruto : `https://${bruto}`);
  } catch {
    return { ok: false, erro: "Esse link não abre. Copie o endereço da página da vaga e cole aqui." };
  }
  if (u.protocol !== "https:")
    return { ok: false, erro: "Use o link com https:// (o endereço seguro da página da vaga)." };
  if (!u.hostname.includes(".") || u.username || u.password)
    return { ok: false, erro: "Esse link não abre. Copie o endereço da página da vaga e cole aqui." };
  const link = u.toString();
  if (link.length > MAX_LINK_CANDIDATURA) return { ok: false, erro: "Esse link é longo demais. Use o da página da vaga." };
  if (!equipe && !siteDeCandidaturaAceito(link))
    return {
      ok: false,
      erro: `Esse site ainda não está na lista do Publike (${EXEMPLOS_DE_SITES} e outros sites de vagas). Para usar o site da sua empresa, fale com a equipe do Publike.`,
    };
  return { ok: true, link };
}

/** O link que sai do Publike: com a origem, para a empresa ver de onde veio o candidato (sem trocar a que já vem). */
export function linkComOrigem(link: string): string {
  try {
    const u = new URL(link);
    if (!u.searchParams.has("utm_source")) {
      u.searchParams.set("utm_source", "publike");
      u.searchParams.set("utm_medium", "vagas");
    }
    return u.toString();
  } catch {
    return link;
  }
}

/** A vaga recebe os candidatos no site da empresa (sem o campo, antes da migração: pelo Publike). */
export const candidaturaNoSite = (a: { candidatura?: string | null } | null | undefined) => a?.candidatura === "site";
