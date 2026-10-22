-- =====================================================================
-- Convites por e-mail (admin › E-mails › "Convites por e-mail")
--
--   Um e-mail de cada vez para um grupo de contas que já existem:
--     * convite_curriculo  pessoas que procuram trabalho e ainda não preencheram o currículo
--     * convite_empresa    comércios e empresas: a gestão de candidatos, grátis
--     * convite_agencia    agências: a gestão de candidatos, clientes, equipe e finalistas
--     * convite_servicos   quem tem serviço no ar: mandar o link da vitrine no WhatsApp e nos grupos
--     * convite_vitrine    quem disse que oferece serviços e ainda não montou a vitrine
--   Cada conta recebe cada convite uma vez só. Segue as regras da fila (e-mails ligados, avisos
--   ligados na conta, e-mail de login confirmado, no máximo 30 por dia). O teste vai para uma
--   conta escolhida pelo e-mail, mesmo com os avisos desligados (como o "Enviar e-mail" da conta).
--   Os textos ficam em E-mails › Textos dos e-mails, com prévia.
--
-- Rode depois de 20261026120000_busca_por_relevancia.sql. Pode rodar de novo.
-- =====================================================================


-- 1. Textos (editáveis no admin) -----------------------------------------------------

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('convite_curriculo', 'usuarios', 0, 'Convite: preencher o currículo',
     'Para quem procura trabalho e ainda não preencheu o currículo. Sai pelo admin, em Convites por e-mail.',
     array['nome', 'link'],
     '{{nome}}, seu currículo no Publike fica pronto em 5 minutos',
     'Oi, {{nome}}.

Muitas vagas no Publike pedem currículo, e quem preenche sai na frente: quando você curte uma vaga, quem publicou já vê seus estudos, suas experiências e seus cursos.

É rápido e de graça:

1. Tem currículo em PDF ou em foto? Mande o arquivo, que o Publike preenche para você. É só conferir.
2. Não tem? Responda umas perguntas simples: até onde estudou, onde já trabalhou, cursos e CNH.
3. Pronto. Cada vaga mostra o quanto combina com você e, se você quiser, as empresas da região acham você na aba Talentos e convidam para a vaga.

Seu telefone só aparece depois do match. E lembre: ninguém pode cobrar para você conseguir trabalho.',
     'Preencher meu currículo'),

    ('convite_empresa', 'usuarios', 0, 'Convite: gestão de candidatos (empresa e comércio)',
     'Para comércios e empresas: mostra as ferramentas grátis para cuidar dos candidatos. Sai pelo admin, em Convites por e-mail.',
     array['nome', 'link'],
     '{{nome}}, cuide dos seus candidatos de graça no Publike',
     'Oi, {{nome}}.

O Publike não é só um lugar para publicar vaga. É uma ferramenta grátis para cuidar dos candidatos do começo ao fim, sem plano e sem taxa por candidato:

• Caixa de entrada: todo mundo que curtiu as suas vagas num lugar só, com perfil e currículo.
• Etapas: marque quem está em análise, em entrevista ou foi contratado. O candidato vê em que pé está, e você para de responder um por um.
• Perguntas de triagem na vaga e o quanto cada pessoa combina com ela.
• Entrevista marcada e conversa pelo próprio Publike. O seu WhatsApp só aparece para quem você escolher.
• Talentos: gente da região que deixou o currículo para as empresas acharem. Convide para a sua vaga.
• Tem a arte da vaga? Mande a foto, e a vaga sai preenchida.
• A lista de cada vaga numa planilha e uma página com todas as suas vagas para mandar no WhatsApp.

E quem mora perto vê a sua vaga primeiro, com o tempo de ônibus até a sua porta.',
     'Abrir meu painel'),

    ('convite_agencia', 'usuarios', 0, 'Convite: gestão de candidatos (agência)',
     'Para agências de emprego e RH: mostra as ferramentas grátis para cuidar dos candidatos e dos clientes. Sai pelo admin, em Convites por e-mail.',
     array['nome', 'link'],
     '{{nome}}, o Publike cuida dos candidatos da sua agência, de graça',
     'Oi, {{nome}}.

A sua agência tem no Publike uma ferramenta grátis para tocar a seleção, sem plano e sem taxa por candidato:

• Clientes: cadastre as empresas para quem você recruta e publique as vagas de cada uma, ou como "Empresa confidencial".
• Caixa de entrada e etapas: quem curtiu cada vaga, com currículo, e em que etapa está (análise, entrevista, contratado).
• Finalistas: mande ao cliente um link com os finalistas de cada vaga, sem passar o contato dos candidatos.
• Equipe: os recrutadores entram com o próprio login e agem pela agência.
• Talentos: gente da região que deixou o currículo para ser achada. Convide para as vagas dos seus clientes.
• Perguntas de triagem, entrevista marcada, conversa pelo Publike e a lista de cada vaga numa planilha.

No match, o candidato recebe o contato da agência, nunca o do cliente. Com o CNPJ conferido, são até 200 vagas no ar.',
     'Abrir o painel da agência'),

    ('convite_servicos', 'usuarios', 0, 'Convite: divulgar a vitrine de serviços',
     'Para quem tem serviço no ar: manda o link da vitrine para divulgar no WhatsApp e nos grupos. Sai pelo admin, em Convites por e-mail.',
     array['nome', 'link'],
     '{{nome}}, mande a sua vitrine do Publike no WhatsApp',
     'Oi, {{nome}}.

A sua vitrine no Publike é uma página só sua, com os seus serviços, fotos, preços e as recomendações de quem já contratou você. Quanto mais gente vê, mais chamados você recebe.

Este é o link da sua vitrine:
{{link}}

Mande no WhatsApp para os seus clientes, ponha no status e nos grupos do bairro, do condomínio, da igreja e da família. Quem abre vê os seus serviços e chama você pelo Publike, de graça.

Peça para quem já contratou você deixar uma recomendação: ela aparece na vitrine e passa confiança para quem ainda não conhece o seu trabalho.',
     'Ver minha vitrine'),

    ('convite_vitrine', 'usuarios', 0, 'Convite: montar a vitrine de serviços',
     'Para quem disse que oferece serviços e ainda não tem serviço no ar. Sai pelo admin, em Convites por e-mail.',
     array['nome', 'link'],
     '{{nome}}, monte a sua vitrine de serviços no Publike (é grátis)',
     'Oi, {{nome}}.

Diarista, pedreiro, manicure, eletricista, cozinheira: no Publike, quem presta serviço tem uma vitrine grátis, com fotos do trabalho, preço e as recomendações dos clientes. Quem mora perto acha você e chama pelo Publike.

Leva poucos minutos:

1. Escolha o que você faz e conte como é o seu serviço.
2. Ponha umas fotos de trabalhos que você já fez.
3. Marque os bairros e as cidades onde você atende.

Depois, é só mandar o link da vitrine no WhatsApp, no status e nos grupos do bairro.',
     'Montar minha vitrine')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;


-- 2. Quem recebe cada convite e para onde o botão leva ---------------------------------

create or replace function privado.recebe_convite(p_modelo text, p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.perfis p
      left join privado.modos_da_conta m on m.conta_id = p.id
     where p.id = p_perfil
       and (p.suspenso_ate is null or p.suspenso_ate <= now())
       and case p_modelo
         when 'convite_curriculo' then
           p.tipo = 'pessoa'
           and (m.modos is null or 'trabalhar' = any (m.modos))
           and not exists (
             select 1 from public.curriculos c
              where c.perfil_id = p.id
                and (c.escolaridade is not null or jsonb_array_length(c.experiencias) > 0 or c.arquivo is not null))
         when 'convite_empresa' then p.tipo in ('empresa', 'comercio')
         when 'convite_agencia' then p.tipo = 'agencia'
         when 'convite_servicos' then exists (
           select 1 from public.anuncios a
            where a.autor_id = p.id and a.tipo = 'servico' and a.status = 'ativo' and a.expira_em > now())
         when 'convite_vitrine' then
           'servicos' = any (coalesce(m.modos, '{}'))
           and not exists (select 1 from public.anuncios a where a.autor_id = p.id and a.tipo = 'servico')
         else false
       end
  )
$$;

create or replace function privado.caminho_do_convite(p_modelo text, p_perfil uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_modelo
    when 'convite_curriculo' then '/perfil/curriculo'
    when 'convite_servicos' then '/perfil/' || p_perfil::text
    when 'convite_vitrine' then '/painel/servicos'
    else '/painel'
  end
$$;

-- Pode receber agora: no grupo, nunca recebeu este convite, e-mail de login confirmado e avisos ligados.
create or replace function privado.pode_receber_convite(p_modelo text, p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.recebe_convite(p_modelo, p_perfil)
     and not exists (select 1 from privado.fila_emails f where f.usuario_id = p_perfil and f.modelo = p_modelo)
     and exists (select 1 from auth.users u where u.id = p_perfil and u.email_confirmed_at is not null
                    and nullif(btrim(u.email::text), '') is not null)
     and coalesce((select c.receber_emails from public.contatos c where c.perfil_id = p_perfil), true)
$$;

revoke execute on function privado.recebe_convite(text, uuid), privado.caminho_do_convite(text, uuid),
  privado.pode_receber_convite(text, uuid) from public, anon, authenticated;


-- 3. Admin: quantos recebem, mandar e testar -------------------------------------------

create or replace function public.admin_convites_por_email()
returns table (modelo text, recebem integer, ja_receberam integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
  select v.m,
         (select count(*)::integer from public.perfis p where privado.pode_receber_convite(v.m, p.id)),
         (select count(distinct f.usuario_id)::integer from privado.fila_emails f where f.modelo = v.m)
    from unnest(array['convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine']) as v (m);
end
$$;

create or replace function public.admin_enviar_convite_email(p_modelo text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes bigint;
  depois bigint;
  p record;
  m public.modelos_email;
begin
  perform privado.exigir_admin();
  select * into m from public.modelos_email me where me.chave = p_modelo and me.chave like 'convite\_%';
  if not found then
    raise exception 'Convite desconhecido.' using errcode = 'P0001';
  end if;
  select count(*) into antes from privado.fila_emails f where f.modelo = p_modelo;
  for p in select pf.id from public.perfis pf where privado.pode_receber_convite(p_modelo, pf.id) loop
    perform privado.enfileirar_email(p.id, p_modelo,
      jsonb_build_object('caminho', privado.caminho_do_convite(p_modelo, p.id)));
  end loop;
  select count(*) into depois from privado.fila_emails f where f.modelo = p_modelo;
  if depois > antes then
    perform privado.registrar('enviar_convite_email', 'config', 'emails', m.nome,
                              jsonb_build_object('total', depois - antes));
  end if;
  return depois - antes;
end
$$;

-- O teste: o convite para uma conta (pelo e-mail de login), mesmo fora do grupo e com os avisos desligados.
create or replace function public.admin_convite_email_teste(p_modelo text, p_email text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid;
begin
  perform privado.exigir_admin();
  if p_modelo not like 'convite\_%' then
    raise exception 'Convite desconhecido.' using errcode = 'P0001';
  end if;
  select u.id into conta from auth.users u where lower(u.email::text) = lower(btrim(coalesce(p_email, ''))) limit 1;
  if conta is null then
    raise exception 'Nenhuma conta do Publike com esse e-mail.' using errcode = 'P0001';
  end if;
  return public.admin_enviar_email(conta, p_modelo,
    jsonb_build_object('caminho', privado.caminho_do_convite(p_modelo, conta)));
end
$$;

revoke execute on function public.admin_convites_por_email(), public.admin_enviar_convite_email(text),
  public.admin_convite_email_teste(text, text) from public, anon, authenticated;
grant execute on function public.admin_convites_por_email(), public.admin_enviar_convite_email(text),
  public.admin_convite_email_teste(text, text) to service_role;

notify pgrst, 'reload schema';
