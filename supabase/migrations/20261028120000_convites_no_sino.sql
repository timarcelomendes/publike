-- Convites no sino: quem não tem e-mail confirmado na conta (entrou pelo celular) não recebe os
-- convites por e-mail. Para essas contas, o mesmo convite chega como aviso no sino, uma vez por
-- conta, pedindo também um e-mail no perfil. Sai pelo admin, em Convites por e-mail ("Avisar no
-- sino"). Funções novas, ao lado das do e-mail (que não mudam).

alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check
  check (tipo in ('curtida', 'match', 'em_analise', 'removido', 'liberado', 'avaliacao', 'avaliacao_retida',
                  'match_desfeito', 'etapa', 'mensagem', 'seguindo', 'recomendacao', 'contratacao',
                  'entrevista', 'entrevista_resposta', 'aceite_curriculo', 'curriculo_recebido', 'busca',
                  'convite', 'vaga_preenchida', 'finalistas', 'convite_candidato', 'equipe', 'conexao',
                  'recado_no_ar', 'recado_retido', 'recado_forca',
                  'convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine'));

-- os avisos de recado e os convites do sino ficam só no sino (sem e-mail)
drop trigger if exists notificacoes_por_email on public.notificacoes;
create trigger notificacoes_por_email
  after insert on public.notificacoes
  for each row
  when (new.tipo not in ('recado_no_ar', 'recado_retido', 'recado_forca', 'convite_curriculo', 'convite_empresa',
                         'convite_agencia', 'convite_servicos', 'convite_vitrine'))
  execute function privado.notificacao_por_email();

-- o texto do aviso de cada convite (o link sai pelo tipo, no sino)
create or replace function privado.texto_do_aviso_convite(p_modelo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_modelo
    when 'convite_curriculo' then
      'Preencha seu currículo: leva 5 minutos e cada vaga mostra o quanto combina com você. Ponha também um e-mail no seu perfil para não perder os avisos.'
    when 'convite_empresa' then
      'Cuide dos seus candidatos de graça: caixa de entrada, etapas, entrevistas e Talentos. Ponha também um e-mail no seu perfil para não perder os avisos.'
    when 'convite_agencia' then
      'A sua agência toca a seleção de graça no Publike: clientes, etapas, finalistas e equipe. Ponha também um e-mail no perfil para não perder os avisos.'
    when 'convite_servicos' then
      'Mande o link da sua vitrine no WhatsApp e nos grupos do bairro: quem abre chama você. Ponha também um e-mail no seu perfil para não perder os avisos.'
    when 'convite_vitrine' then
      'Monte a sua vitrine de serviços: fotos, preço e onde você atende, de graça. Ponha também um e-mail no seu perfil para não perder os avisos.'
  end
$$;

-- quem recebe o convite no sino: está no grupo do convite, não tem e-mail confirmado e ainda não recebeu
create or replace function privado.pode_receber_aviso_convite(p_modelo text, p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.recebe_convite(p_modelo, p_perfil)
     and not exists (select 1 from public.notificacoes n where n.destinatario_id = p_perfil and n.tipo = p_modelo)
     and not exists (select 1 from auth.users u where u.id = p_perfil and u.email_confirmed_at is not null
                        and nullif(btrim(u.email::text), '') is not null)
$$;

revoke execute on function privado.texto_do_aviso_convite(text), privado.pode_receber_aviso_convite(text, uuid)
  from public, anon, authenticated;

-- para o admin: quantos recebem no sino agora e quantos já receberam
create or replace function public.admin_avisos_de_convite()
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
         (select count(*)::integer from public.perfis p where privado.pode_receber_aviso_convite(v.m, p.id)),
         (select count(distinct n.destinatario_id)::integer from public.notificacoes n where n.tipo = v.m)
    from unnest(array['convite_curriculo', 'convite_empresa', 'convite_agencia', 'convite_servicos', 'convite_vitrine']) as v (m);
end
$$;

-- o aviso no sino para todas as contas sem e-mail do grupo (devolve quantos)
create or replace function public.admin_enviar_aviso_convite(p_modelo text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer;
  m public.modelos_email;
begin
  perform privado.exigir_admin();
  select * into m from public.modelos_email me where me.chave = p_modelo and me.chave like 'convite\_%';
  if not found or privado.texto_do_aviso_convite(p_modelo) is null then
    raise exception 'Convite desconhecido.' using errcode = 'P0001';
  end if;
  insert into public.notificacoes (destinatario_id, tipo, texto)
  select p.id, p_modelo, privado.texto_do_aviso_convite(p_modelo)
    from public.perfis p
   where privado.pode_receber_aviso_convite(p_modelo, p.id);
  get diagnostics total = row_count;
  if total > 0 then
    perform privado.registrar('enviar_aviso_convite', 'config', 'emails', m.nome, jsonb_build_object('total', total));
  end if;
  return total;
end
$$;

revoke execute on function public.admin_avisos_de_convite(), public.admin_enviar_aviso_convite(text)
  from public, anon, authenticated;
grant execute on function public.admin_avisos_de_convite(), public.admin_enviar_aviso_convite(text) to service_role;

notify pgrst, 'reload schema';
