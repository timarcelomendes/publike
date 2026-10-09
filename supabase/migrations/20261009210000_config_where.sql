-- =====================================================================
-- Salvar as configurações de e-mail e de IA no admin.
--
-- O Supabase barra UPDATE sem WHERE nas chamadas pela API (extensão
-- pg-safeupdate), mesmo dentro de funções. config_site tem uma linha só,
-- mas o UPDATE precisa dizer qual: "where id".
--
-- Rode depois de 20261009200000_curriculos.sql (pode rodar de novo sem problema).
-- =====================================================================

create or replace function public.admin_salvar_config_emails(
  p_emails_ativos boolean,
  p_remetente_nome text,
  p_responder_para text,
  p_email_curtida boolean,
  p_email_match boolean,
  p_email_moderacao boolean,
  p_email_conta boolean,
  p_avisos_para text[],
  p_aviso_denuncia boolean,
  p_aviso_cadastro boolean,
  p_aviso_retirado boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lista text[];
  responder text := nullif(lower(btrim(coalesce(p_responder_para, ''))), '');
begin
  perform privado.exigir_admin();
  select coalesce(array_agg(distinct lower(btrim(x))), '{}') into lista
    from unnest(coalesce(p_avisos_para, '{}')) as x
   where btrim(x) <> '';
  if exists (select 1 from unnest(lista) as x where x !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
    raise exception 'Confira os e-mails que recebem os avisos da equipe.' using errcode = 'P0001';
  end if;
  if cardinality(lista) > 10 then
    raise exception 'Coloque no máximo 10 e-mails para os avisos.' using errcode = 'P0001';
  end if;
  if responder is not null and responder !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Confira o e-mail de resposta.' using errcode = 'P0001';
  end if;
  if char_length(btrim(coalesce(p_remetente_nome, ''))) not between 2 and 60 then
    raise exception 'O nome do remetente precisa ter entre 2 e 60 letras.' using errcode = 'P0001';
  end if;
  update public.config_site
     set emails_ativos = coalesce(p_emails_ativos, true),
         remetente_nome = btrim(p_remetente_nome),
         responder_para = responder,
         email_curtida = coalesce(p_email_curtida, true),
         email_match = coalesce(p_email_match, true),
         email_moderacao = coalesce(p_email_moderacao, true),
         email_conta = coalesce(p_email_conta, true),
         avisos_para = lista,
         aviso_denuncia = coalesce(p_aviso_denuncia, true),
         aviso_cadastro = coalesce(p_aviso_cadastro, true),
         aviso_retirado = coalesce(p_aviso_retirado, true),
         atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('salvar_config', 'config', 'emails', 'E-mails', '{}'::jsonb);
end
$$;

create or replace function public.admin_salvar_config_ia(
  p_moderacao boolean,
  p_melhorar_texto boolean,
  p_resumo boolean,
  p_modelo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  if coalesce(p_modelo, '') !~ '^[a-z0-9][a-z0-9.-]{2,60}$' then
    raise exception 'Modelo inválido.' using errcode = '22023';
  end if;
  update public.config_site
     set ia_moderacao = coalesce(p_moderacao, false),
         ia_melhorar_texto = coalesce(p_melhorar_texto, false),
         ia_resumo = coalesce(p_resumo, false),
         ia_modelo = p_modelo,
         atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('salvar_config', 'config', 'ia', 'IA',
                            jsonb_build_object('moderacao', p_moderacao, 'melhorar_texto', p_melhorar_texto,
                                               'resumo', p_resumo, 'modelo', p_modelo));
end
$$;

notify pgrst, 'reload schema';
