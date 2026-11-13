// A candidatura no site da empresa (claude/plano-candidatura-no-site-da-empresa.md), sem banco e sem rede: as regras
// do link, a lista de sites igual à do banco e a leitura da página da vaga na Gupy (com uma página montada no formato
// de 13/11/2026). Roda com `npx tsx scripts/testar-candidatura.ts` (sai com erro se algo mudou).
import { readFileSync } from "node:fs";
import {
  linkComOrigem,
  lerLinkDeCandidatura,
  nomeDoSiteDeCandidatura,
  SITES_DE_CANDIDATURA,
  siteDeCandidaturaAceito,
} from "../src/lib/candidatura";
import {
  cepDoEndereco,
  descricaoDaGupy,
  fechadaNaGupy,
  lerPaginaDaGupy,
  linhasDoHtml,
  linkLimpoDaGupy,
  modeloDaGupy,
  regimeDaGupy,
} from "../src/lib/gupy";
import { lerAnuncio, registroDoAnuncio } from "../src/lib/validacao";

let falhas = 0;
let total = 0;
function igual(nome: string, veio: unknown, esperado: unknown) {
  total++;
  const a = JSON.stringify(veio);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    falhas++;
    console.error(`✗ ${nome}\n    veio:     ${a}\n    esperado: ${b}`);
  }
}

// ------------------------------------------------------------------ o link

const gupy = "https://nutriex.gupy.io/jobs/12833169?jobBoardSource=gupy_public_page";
igual("link da Gupy vale", lerLinkDeCandidatura(gupy), { ok: true, link: gupy });
igual("sem https:// ganha o https", lerLinkDeCandidatura("nutriex.gupy.io/jobs/1"), {
  ok: true,
  link: "https://nutriex.gupy.io/jobs/1",
});
igual("espaços em volta saem", lerLinkDeCandidatura("  https://nutriex.inhire.app/vagas/abc  ").ok, true);
igual("http não vale", lerLinkDeCandidatura("http://nutriex.gupy.io/jobs/1").ok, false);
igual("vazio pede o link", lerLinkDeCandidatura("   "), { ok: false, erro: "Cole o link da vaga no site da empresa." });
igual("usuário no endereço não vale", lerLinkDeCandidatura("https://x@nutriex.gupy.io/jobs/1").ok, false);
igual("sem ponto não vale", lerLinkDeCandidatura("https://localhost/vaga").ok, false);
igual("javascript: não vale", lerLinkDeCandidatura("javascript:alert(1)").ok, false);
igual("site da empresa: quem publica não pode", lerLinkDeCandidatura("https://www.nutriex.com.br/vagas/1").ok, false);
igual(
  "site da empresa: a equipe pode",
  lerLinkDeCandidatura("https://www.nutriex.com.br/vagas/1", { equipe: true }),
  { ok: true, link: "https://www.nutriex.com.br/vagas/1" },
);
igual("longo demais", lerLinkDeCandidatura(`https://nutriex.gupy.io/jobs/1?x=${"a".repeat(500)}`).ok, false);

igual("subdomínio da Gupy", siteDeCandidaturaAceito("https://nutriex.gupy.io/jobs/1"), true);
igual("a própria Gupy", siteDeCandidaturaAceito("https://gupy.io/"), true);
igual("parecido não vale (evilgupy.io)", siteDeCandidaturaAceito("https://evilgupy.io/jobs/1"), false);
igual("Gupy no meio não vale", siteDeCandidaturaAceito("https://gupy.io.golpe.com/jobs/1"), false);
igual("Sólides", siteDeCandidaturaAceito("https://empresa.solides.jobs/vaga/1"), true);
igual("nome do site", nomeDoSiteDeCandidatura("https://nutriex.gupy.io/jobs/1"), "Gupy");
igual("site próprio sem nome", nomeDoSiteDeCandidatura("https://www.nutriex.com.br/vagas"), null);

igual(
  "a origem vai no link",
  linkComOrigem("https://nutriex.gupy.io/jobs/1?jobBoardSource=gupy_public_page"),
  "https://nutriex.gupy.io/jobs/1?jobBoardSource=gupy_public_page&utm_source=publike&utm_medium=vagas",
);
igual(
  "a origem que já vem fica",
  linkComOrigem("https://nutriex.gupy.io/jobs/1?utm_source=outra"),
  "https://nutriex.gupy.io/jobs/1?utm_source=outra",
);

// a mesma lista do banco (privado.site_de_candidatura_aceito)
const migracao = readFileSync(
  new URL("../supabase/migrations/20270513120000_candidatura_no_site.sql", import.meta.url),
  "utf8",
);
const doBanco = [
  ...(migracao.match(/site_de_candidatura_aceito\(p_link text\)[\s\S]*?array\[([\s\S]*?)\]/)?.[1] ?? "").matchAll(
    /'([^']+)'/g,
  ),
]
  .map((m) => m[1].replace(/\\\./g, "."))
  .sort();
igual("a lista do site é a do banco", Object.keys(SITES_DE_CANDIDATURA).sort(), doBanco);

// ------------------------------------------------------------------ a página da Gupy

igual("link limpo", linkLimpoDaGupy(gupy), "https://nutriex.gupy.io/jobs/12833169");
igual("a página de carreiras não é vaga", linkLimpoDaGupy("https://nutriex.gupy.io/"), null);
igual("outro site não é Gupy", linkLimpoDaGupy("https://nutriex.inhire.app/jobs/1"), null);
igual("http não é", linkLimpoDaGupy("http://nutriex.gupy.io/jobs/1"), null);
igual("regime CLT", regimeDaGupy("vacancy_type_effective"), "clt");
igual("regime estágio", regimeDaGupy("vacancy_type_internship"), "estagio");
igual("regime desconhecido", regimeDaGupy("vacancy_type_novo"), null);
igual("modelo presencial", modeloDaGupy("on-site"), "presencial");
igual("modelo híbrido", modeloDaGupy("hybrid"), "hibrido");
igual("CEP do endereço", cepDoEndereco("BR-153, Goiânia, Goiás, Brasil, 74850-370"), "74850370");
igual("sem CEP", cepDoEndereco("Goiânia, Goiás"), null);
igual(
  "HTML em linhas",
  linhasDoHtml("<p><strong>🔹 Sobre&nbsp;nós:</strong></p><ul><li>Organizar</li><li>Conferir &amp; separar</li></ul><p><br></p>"),
  ["🔹 Sobre nós:", "• Organizar", "• Conferir & separar"],
);

const job = {
  id: 12833169,
  name: "AUXILIAR DE ESTOQUE",
  description:
    '<p><strong>🔹 Sobre Nós:</strong></p><p data-pm-slice="1 1 []">A Nutriex é uma empresa brasileira que atua no cuidado e no bem-estar.</p>',
  responsibilities: "<p><strong>🔹 Como será seu dia a dia:</strong></p><ul><li>Receber e conferir materiais;</li><li>Separar pedidos.</li></ul>",
  prerequisites: "<ul><li>Ensino médio completo;</li><li>Mande o currículo para rh@nutriex.com.br</li></ul>",
  relevantExperiences: "<p>Ligue (62) 99999-1234 para saber mais.</p><p>Vale-transporte e refeição no local.</p>",
  handicapped: true,
  addressLine: "BR-153, Goiânia, Goiás, Brasil, 74850-370",
  addressCity: "Goiânia",
  addressState: "Goiás",
  addressStateShortName: "GO",
  jobType: "vacancy_type_effective",
  status: "published",
  expiresAt: "2026-12-21",
  workplaceType: "on-site",
  isJobPostedOnGoogle: false,
  careerPage: { name: "Nutriex" },
  company: { name: "Nutriex Ltda" },
};
const pagina = (j: unknown) =>
  `<!DOCTYPE html><html><head><title>Página da Vaga</title></head><body><div id="__next"></div><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    { props: { pageProps: { job: j } }, page: "/jobs/[id]", buildId: "x" },
  )}</script></body></html>`;

const lida = lerPaginaDaGupy(pagina(job), gupy);
igual("lê a vaga", lida.ok, true);
if (lida.ok) {
  const v = lida.vaga;
  igual("o link fica limpo", v.link, "https://nutriex.gupy.io/jobs/12833169");
  igual("título", v.titulo, "AUXILIAR DE ESTOQUE");
  igual("cidade, UF e CEP", [v.cidade, v.uf, v.cep], ["Goiânia", "GO", "74850370"]);
  igual("tipo, modelo e PCD", [v.tipo, v.modelo, v.pcd], ["vacancy_type_effective", "on-site", true]);
  igual("situação e fim", [v.situacao, v.expiraEm], ["published", "2026-12-21"]);
  igual("a empresa da página de carreiras", v.empresa, "Nutriex");
  igual("tira as linhas com contato", v.linhasComContato, 2);
  igual(
    "a descrição em texto",
    v.descricao,
    [
      "🔹 Sobre Nós:",
      "A Nutriex é uma empresa brasileira que atua no cuidado e no bem-estar.",
      "",
      "🔹 Como será seu dia a dia:",
      "• Receber e conferir materiais;",
      "• Separar pedidos.",
      "",
      "Requisitos e qualificações:",
      "• Ensino médio completo;",
      "",
      "Informações adicionais:",
      "Vale-transporte e refeição no local.",
    ].join("\n"),
  );
  igual("sem corte", v.descricaoCortada, false);
  igual("aberta hoje", fechadaNaGupy(v, "2026-11-13"), null);
  igual("aberta no último dia", fechadaNaGupy(v, "2026-12-21"), null);
  igual("vencida no dia seguinte", fechadaNaGupy(v, "2026-12-22"), "a publicação na Gupy venceu em 21/12/2026");
}
igual(
  "fechada na Gupy",
  fechadaNaGupy({ situacao: "closed", expiraEm: null }, "2026-11-13"),
  "a vaga fechou na Gupy (situação: closed)",
);

const longa = descricaoDaGupy({ description: `<p>${"palavra ".repeat(300)}</p>`.repeat(3) });
igual("a descrição longa é cortada entre linhas", [longa.cortada, longa.texto.length <= 3000], [true, true]);

// o formato mudou: o que faltou vai no aviso para a equipe
igual("sem o __NEXT_DATA__", lerPaginaDaGupy("<html><body>Vaga</body></html>", gupy), {
  ok: false,
  formato: "a página da vaga não tem mais o dado __NEXT_DATA__",
});
igual(
  "o __NEXT_DATA__ quebrado",
  lerPaginaDaGupy('<script id="__NEXT_DATA__" type="application/json">{quebrado</script>', gupy),
  { ok: false, formato: "o dado __NEXT_DATA__ da página não é mais JSON" },
);
igual("a vaga em outro lugar", lerPaginaDaGupy(pagina(undefined), gupy), {
  ok: false,
  formato: "o dado da página não tem mais a vaga em props.pageProps.job",
});
igual("a vaga sem name e status", lerPaginaDaGupy(pagina({ title: "Auxiliar" }), gupy), {
  ok: false,
  formato: "a vaga em props.pageProps.job não tem mais name e status",
});
igual(
  "o script com os atributos em outra ordem",
  lerPaginaDaGupy(
    `<script type="application/json" id="__NEXT_DATA__" nonce="x">${JSON.stringify({ props: { pageProps: { job } } })}</script>`,
    gupy,
  ).ok,
  true,
);

// ------------------------------------------------------------------ o formulário da vaga (lerAnuncio)

function formulario(extra: Record<string, string>) {
  const f = new FormData();
  const base: Record<string, string> = {
    tipo: "vaga",
    titulo: "Auxiliar de estoque",
    descricao: "Receber, conferir e organizar as mercadorias do estoque.",
    categoria: "logistica",
    regime: "clt",
    combinar: "on",
    vagas: "1",
    cidade: "Goiânia",
    bairro: "Setor Bueno",
    lat: "-16.705",
    lng: "-49.268",
    pede_curriculo: "on",
    contato_direto: "on",
    // uma pergunta pela metade (sem o nome): no site da empresa, não vale nem dá erro
    perguntas: JSON.stringify([{ id: "p1", tipo: "sim_nao", nome: "", opcoes: [] }]),
  };
  for (const [k, v] of Object.entries({ ...base, ...extra })) f.set(k, v);
  return f;
}
const noSite = lerAnuncio(formulario({ candidatura: "site", link_candidatura: "nutriex.gupy.io/jobs/12833169" }));
igual("no site: lê", noSite.ok, true);
if (noSite.ok) {
  const d = noSite.dados;
  igual(
    "no site: sem currículo, contato direto e perguntas",
    [d.candidatura, d.link_candidatura, d.pede_curriculo, d.contato_direto, d.perguntas, d.triagem],
    ["site", "https://nutriex.gupy.io/jobs/12833169", false, false, [], {}],
  );
  const r = registroDoAnuncio(d);
  igual("no site: grava as colunas novas", [r.candidatura, r.link_candidatura], ["site", "https://nutriex.gupy.io/jobs/12833169"]);
}
const semLink = lerAnuncio(formulario({ candidatura: "site", link_candidatura: "" }));
igual("no site sem o link: o erro no campo", semLink.ok ? null : semLink.erros, {
  link_candidatura: "Cole o link da vaga no site da empresa.",
});
const daEquipe = lerAnuncio(formulario({ candidatura: "site", link_candidatura: "https://www.nutriex.com.br/vagas/1" }), {
  equipe: true,
});
igual("a equipe usa o site da empresa", daEquipe.ok && daEquipe.dados.link_candidatura, "https://www.nutriex.com.br/vagas/1");
const pelaPublike = lerAnuncio(formulario({ candidatura: "publike", perguntas: "[]" }));
igual(
  "pelo Publike: não mexe nas colunas novas",
  pelaPublike.ok && ["candidatura" in registroDoAnuncio(pelaPublike.dados), pelaPublike.dados.pede_curriculo],
  [false, true],
);
const voltou = lerAnuncio(formulario({ candidatura: "publike", candidatura_era_site: "1", perguntas: "[]" }));
igual(
  "de volta ao Publike: limpa o link",
  voltou.ok && [registroDoAnuncio(voltou.dados).candidatura, registroDoAnuncio(voltou.dados).link_candidatura],
  ["publike", null],
);

if (falhas) {
  console.error(`\n${falhas} de ${total} conferências falharam.`);
  process.exit(1);
}
console.log(`Candidatura no site: ${total} conferências, tudo certo.`);
