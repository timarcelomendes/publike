"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { rascunhoValido, type RascunhoConvite } from "@/lib/convites";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { lerVagasImportadas } from "@/lib/ia/importar-vaga";
import { ErroIA, iaConfigurada, MODELO_PADRAO } from "@/lib/ia/openai";
import { registrarFalha, textoDoErro } from "@/lib/servidor/falhas";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// "Colar o texto da vaga" (passo 1 do publicar; claude/plano-publicar-em-passos.md): quem publica cola o anúncio
// (do WhatsApp, de um e-mail, de outro site) e a IA preenche a vaga, com a mesma leitura do admin e a cota da
// ajuda da IA da conta. Uma vaga por vez: com várias no texto, vem a primeira e o total. Nada é salvo aqui.

export type LeituraDoTexto = { ok: true; vaga: RascunhoConvite; total: number } | { ok: false; erro: string };

const MIN = 20;
const MAX = 6000;

export async function lerTextoDaVaga(texto: string): Promise<LeituraDoTexto> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!iaConfigurada()) return { ok: false, erro: "A leitura do texto não está disponível agora." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para continuar." };
  const colado = typeof texto === "string" ? texto.trim() : "";
  if (colado.length < MIN) return { ok: false, erro: "Cole o texto da vaga: o cargo, o salário, o horário e o local." };
  if (colado.length > MAX) return { ok: false, erro: `O texto passou de ${MAX} letras. Cole só a vaga.` };

  // a mesma cota da ajuda da IA (o admin, no computador dele, não gasta)
  const supabase = await criarClienteServidor();
  let modelo = MODELO_PADRAO;
  const admin = await clienteAdminOuNulo();
  if (admin) {
    const { data } = await admin.rpc("admin_config");
    modelo = data?.[0]?.ia_modelo ?? modelo;
  } else {
    const { error } = await supabase.rpc("usar_ia_texto");
    if (error) return { ok: false, erro: mensagemDeErro(error) };
    const { data } = await supabase.rpc("config_publica");
    modelo = data?.[0]?.ia_modelo ?? modelo;
  }

  try {
    const vagas = await lerVagasImportadas({ textoColado: colado }, modelo);
    const v = vagas[0];
    const vaga = v
      ? rascunhoValido({
          titulo: v.titulo,
          descricao: v.descricao,
          categoria: v.categoria,
          regime: v.regime ?? "",
          salario: v.pagamento_valor,
          salario_ate: v.pagamento_ate,
          unidade: v.pagamento_unidade ?? "",
          beneficios: v.beneficios_lista,
          bairro: v.bairro ?? "",
          cidade: "",
          quantidade: v.vagas,
        })
      : null;
    if (!vaga) return { ok: false, erro: "Não achamos uma vaga neste texto. Confira se ele diz o cargo." };
    return { ok: true, vaga, total: vagas.length };
  } catch (e) {
    const erro = e instanceof ErroIA ? e.message : "Não deu para ler o texto agora. Tente de novo.";
    console.error("Publike: a leitura do texto da vaga falhou:", e);
    await registrarFalha({
      onde: "vaga",
      etapa: "leitura",
      mensagem: erro,
      detalhe: `texto da vaga · ${textoDoErro(e)}`,
    });
    return { ok: false, erro };
  }
}
