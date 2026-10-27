-- Convite: concluir o perfil (27/10/2026). Para quem criou a conta (entrou pelo e-mail, Google ou LinkedIn) e
-- parou antes de terminar o cadastro: não tem perfil. O e-mail leva a /perfil. Como essas contas não têm perfil,
-- elas não têm nome (o texto não usa {{nome}}) e não recebem no sino. Só depois de 1 hora da conta criada,
-- para não pegar quem está no meio do cadastro. Pode rodar de novo.

insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('convite_perfil', 'usuarios', 0, 'Convite: concluir o perfil',
     'Para quem criou a conta e não terminou o cadastro. Sai pelo admin, em Convites por e-mail.',
     array['link'],
     'Falta só um passo para usar o Publike',
     'Oi!

Você criou sua conta no Publike, mas o cadastro ficou pela metade. Falta só dizer seu nome, o seu bairro e o que você quer fazer no Publike. Leva 1 minuto.

Com o cadastro pronto:

• Veja as vagas, diárias e serviços perto da sua casa, com a distância e o valor.
• Curta a vaga para se candidatar. Se quem publicou aceitar, o WhatsApp de vocês dois aparece.
• Vai contratar? Publique a vaga de graça e receba candidatos da região.

É de graça. Toque no botão e entre com este mesmo e-mail.',
     'Terminar meu cadastro')
  ) as v (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do nothing;

-- quem recebe: as contas sem perfil (as outras, como antes)
create or replace function privado.recebe_convite(p_modelo text, p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_modelo = 'convite_perfil' then
      exists (select 1 from auth.users u
               where u.id = p_perfil
                 and u.created_at < now() - interval '1 hour'
                 and (u.banned_until is null or u.banned_until <= now()))
      and not exists (select 1 from public.perfis p where p.id = p_perfil)
    else exists (
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
  end
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
    when 'convite_perfil' then '/perfil'
    else '/painel'
  end
$$;

revoke execute on function privado.recebe_convite(text, uuid), privado.caminho_do_convite(text, uuid)
  from public, anon, authenticated;

-- as contas de cada convite: o de concluir o perfil procura nas contas (não há perfil)
create or replace function privado.contas_do_convite(p_modelo text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id from auth.users u where p_modelo = 'convite_perfil'
  union all
  select p.id from public.perfis p where p_modelo <> 'convite_perfil'
$$;
revoke execute on function privado.contas_do_convite(text) from public, anon, authenticated;

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
         (select count(*)::integer from privado.contas_do_convite(v.m) as c (id)
           where privado.pode_receber_convite(v.m, c.id)),
         (select count(distinct f.usuario_id)::integer from privado.fila_emails f where f.modelo = v.m)
    from unnest(array['convite_perfil', 'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos',
                      'convite_vitrine']) as v (m);
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
  for p in select c.id from privado.contas_do_convite(p_modelo) as c (id)
            where privado.pode_receber_convite(p_modelo, c.id) loop
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

revoke execute on function public.admin_convites_por_email(), public.admin_enviar_convite_email(text)
  from public, anon, authenticated;
grant execute on function public.admin_convites_por_email(), public.admin_enviar_convite_email(text) to service_role;

notify pgrst, 'reload schema';
