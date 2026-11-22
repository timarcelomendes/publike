// As atividades da vaga (src/lib/servidor/atividades-da-vaga.ts e src/lib/ia/atividades.ts, migração
// 20270831120000), sem banco e sem a IA: o `fetch` é trocado por respostas prontas. Confere o texto que vai para a IA
// (sem nome nem contato), a resposta conferida (o trecho tem que estar no currículo), os pares escolhidos (só quem tem
// trabalho na mesma função, candidatos primeiro, sem reler o que não mudou) e o robô das filas (desligado não lê;
// ligado guarda; sem o que a pessoa fazia fica "sem" sem chamar a IA).
// Roda com `npx tsx scripts/testar-atividades.ts` (sai com erro se algo mudou).

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createRequire } from "node:module";

const exigir = createRequire(__filename);
const servidorSo = exigir.resolve("server-only");
exigir.cache[servidorSo] = { id: servidorSo, filename: servidorSo, loaded: true, exports: {} } as any;

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.falso";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.ANTHROPIC_API_KEY = "sk-ant-falsa";
process.env.OPENAI_API_KEY = "sk-falsa";
process.env.PUBLIKE_CHAVE_SERVIDOR = "chave-teste-servidor-123456";
process.env.NEXT_PUBLIC_SITE_URL = "https://publike.org";

let falhas = 0;
let total = 0;
function conferir(ok: boolean, nome: string, detalhe?: unknown) {
  total++;
  if (!ok) {
    falhas++;
    console.error(`✗ ${nome}${detalhe === undefined ? "" : `\n    ${JSON.stringify(detalhe)}`}`);
  }
}

const VAGA = "10000000-0000-0000-0000-000000000001";
const ANA = "20000000-0000-0000-0000-000000000001";
const BIA = "20000000-0000-0000-0000-000000000002";
const CAIO = "20000000-0000-0000-0000-000000000003";
const DANI = "20000000-0000-0000-0000-000000000004";
const recepcao = {
  cargo: "Recepcionista",
  onde: "Clínica X",
  inicio: "2022-01",
  fim: "2024-06",
  descricao: "Atendia pacientes no balcão, agendava consultas por telefone e fazia o cadastro no sistema",
};
const pedreiro = { cargo: "Pedreiro", onde: "Obra", inicio: "2020-01", fim: "2023-01", descricao: "Assentava tijolos" };
const recepcaoSemDescricao = { ...recepcao, descricao: "" };

let ligado = false;
let respostaIA: any = {};
let pedidosClaude: any[] = [];
let guardados: any[] = [];
let lidos: any[] = [];
const cboDe = new Map<string, string>();

const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
(globalThis as any).fetch = async (url: any, init: any) => {
  const u = String(url);
  const corpo = init?.body ? JSON.parse(String(init.body)) : null;
  if (u.includes("anthropic.com")) {
    pedidosClaude.push(corpo);
    return json({ content: [{ type: "text", text: JSON.stringify(respostaIA) }], stop_reason: "end_turn", usage: { input_tokens: 900, output_tokens: 60 } });
  }
  if (u.includes("/rpc/funcoes_das_experiencias"))
    return json((corpo?.p_chaves ?? []).flatMap((c: string) => (cboDe.has(c) ? [{ chave: c, cbo: cboDe.get(c) }] : [])));
  if (u.includes("/rpc/servidor_config_atividades")) return json({ ligado, modelo: null });
  if (u.includes("/rpc/servidor_dados_para_atividades"))
    return json({
      vagas: [
        {
          id: VAGA,
          titulo: "Recepcionista",
          descricao: "Recepcionista para clínica: atender pacientes, agendar consultas e cuidar do cadastro no sistema.",
          cbo: "422105",
        },
      ],
      candidaturas: [{ anuncio_id: VAGA, perfil_id: BIA }],
      pessoas: [
        { perfil_id: ANA, experiencias: [recepcao] },
        { perfil_id: BIA, experiencias: [recepcao] },
        { perfil_id: CAIO, experiencias: [pedreiro] },
        { perfil_id: DANI, experiencias: [recepcaoSemDescricao] },
      ],
      lidos,
    });
  if (u.includes("/rpc/servidor_guardar_atividades")) {
    guardados.push(corpo);
    return json(null);
  }
  if (u.includes("/rpc/ia_reserva")) return json(false);
  if (u.includes("/rpc/servidor_contar_uso_da_ia")) return json(null);
  return json(null);
};

(async () => {
  const ia = await import("../src/lib/ia/atividades");
  const s = await import("../src/lib/servidor/atividades-da-vaga");
  const { chaveDaExperiencia } = await import("../src/lib/servidor/funcoes-pelo-contexto");
  for (const e of [recepcao, recepcaoSemDescricao]) cboDe.set(chaveDaExperiencia(e), "422105");
  cboDe.set(chaveDaExperiencia(pedreiro), "715210");

  // o texto que vai para a IA: a vaga e os trabalhos, com o tempo pronto, sem nome nem contato
  const trabalhos = [{ cargo: "Recepcionista", meses: 30, descricao: recepcao.descricao }];
  const vaga = { titulo: "Recepcionista", descricao: "Atender pacientes e agendar consultas na clínica." };
  const msg = ia.mensagemDasAtividades(vaga, trabalhos);
  conferir(
    msg.includes("<vaga>") && msg.includes("2 anos e 6 meses") && msg.includes("agendava consultas") && !/@|\(62\)/.test(msg),
    "a mensagem para a IA",
    msg,
  );

  // a resposta conferida: o trecho tem que estar no que a pessoa escreveu
  conferir(
    ia.conferirAtividades({ resultado: "sim", trecho: "agendava consultas por telefone" }, trabalhos)?.resultado === "sim",
    "trecho que está no currículo vale",
  );
  conferir(
    ia.conferirAtividades({ resultado: "sim", trecho: "“Agendava consultas, por telefone.”" }, trabalhos)?.resultado === "sim",
    "o trecho vale sem as aspas, as maiúsculas e a pontuação",
  );
  conferir(ia.conferirAtividades({ resultado: "sim", trecho: "operava o caixa e fazia sangria" }, trabalhos) === null, "trecho inventado não vale");
  conferir(ia.conferirAtividades({ resultado: "talvez", trecho: "agendava consultas" }, trabalhos) === null, "resultado fora da lista não vale");
  conferir(
    ia.daParaComparar(vaga, trabalhos) && !ia.daParaComparar(vaga, [{ cargo: "Recepcionista", meses: 10, descricao: "" }]),
    "sem o que a pessoa fazia, não dá para comparar",
  );

  // os pares: só quem tem trabalho na mesma função, primeiro quem se candidatou
  const dados = {
    vagas: [{ id: VAGA, titulo: "Recepcionista", descricao: "Recepcionista para clínica: atender pacientes e agendar.", cbo: "422105" }],
    candidaturas: [{ anuncio_id: VAGA, perfil_id: BIA }],
    pessoas: [
      { perfil_id: ANA, experiencias: [recepcao] },
      { perfil_id: BIA, experiencias: [recepcao] },
      { perfil_id: CAIO, experiencias: [pedreiro] },
    ],
    lidos: [],
  };
  const pares = await s.paresParaLer(dados, Date.UTC(2026, 10, 22));
  conferir(
    pares.length === 2 && pares[0].perfil_id === BIA && pares[0].candidato && pares[1].perfil_id === ANA,
    "os pares: a candidata primeiro, sem o pedreiro",
    pares.map((p) => [p.perfil_id, p.candidato]),
  );
  const jaLido = await s.paresParaLer(
    { ...dados, lidos: [{ anuncio_id: VAGA, perfil_id: BIA, impressao: pares[0].impressao }] },
    Date.UTC(2026, 10, 22),
  );
  conferir(jaLido.length === 1 && jaLido[0].perfil_id === ANA, "o par já lido, sem mudar, não volta", jaLido.map((p) => p.perfil_id));

  // o robô: desligado, não lê
  ligado = false;
  pedidosClaude = [];
  guardados = [];
  let rodada = await s.atividadesDasVagas(6);
  conferir(rodada.lidos === 0 && pedidosClaude.length === 0 && guardados.length === 0, "desligado: nada vai para a IA", rodada);

  // ligado: a candidata primeiro, com o Haiku; sem o que fazia, "sem" sem a IA
  ligado = true;
  respostaIA = { resultado: "parte", trecho: "agendava consultas por telefone" };
  rodada = await s.atividadesDasVagas(6);
  const daBia = guardados.find((g) => g.p_perfil === BIA);
  const daDani = guardados.find((g) => g.p_perfil === DANI);
  conferir(
    rodada.lidos === 2 &&
      pedidosClaude.length === 2 &&
      pedidosClaude[0]?.model === "claude-haiku-5-5" &&
      daBia?.p_resultado === "parte" &&
      daBia?.p_trecho === "agendava consultas por telefone" &&
      daDani?.p_resultado === "sem" &&
      !guardados.some((g) => g.p_perfil === CAIO) &&
      !JSON.stringify(pedidosClaude).includes(BIA),
    "ligado: compara com o Haiku, guarda, o sem descrição fica sem a IA e o pedreiro fica de fora",
    { rodada, pedidos: pedidosClaude.length, guardados },
  );

  // a IA inventa o trecho: o par fica "sem" (não vale para a nota)
  guardados = [];
  pedidosClaude = [];
  lidos = [];
  respostaIA = { resultado: "nao", trecho: "dirigia caminhão" };
  await s.atividadesDasVagas(1);
  conferir(guardados.find((g) => g.p_perfil === BIA)?.p_resultado === "sem", "trecho inventado: fica sem", guardados);

  console.log(falhas ? `${falhas} de ${total} conferências falharam.` : `${total} conferências, todas certas.`);
  process.exit(falhas ? 1 : 0);
})();
