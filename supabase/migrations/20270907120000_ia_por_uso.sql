-- Cada uso da IA com o seu liga e desliga e o seu modelo (22/11/2026; Marcelo: "tudo que usa IA precisa ter controle
-- individual e com opções de selecionar o modelo na tela do admin/ia"). Os usos são a lista USOS_IA de
-- src/lib/ia-nomes.ts (o chat do site, revisar anúncios, o currículo do PDF, a transcrição do WhatsApp...). Em
-- `config_site.ia_usos`: {uso: {"ligado": false, "modelo": "..."}}; sem nada, ligado e com o modelo do grupo. O uso da
-- IA passa a ser contado por uso (o nome tem "_"). Pode rodar de novo.

alter table public.config_site add column if not exists ia_usos jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'config_site_ia_usos_objeto') then
    alter table public.config_site
      add constraint config_site_ia_usos_objeto check (jsonb_typeof(ia_usos) = 'object');
  end if;
end
$$;

-- o que o servidor lê antes de cada chamada da IA (nada é segredo: quais usos estão desligados e os modelos)
create or replace function public.config_ia_usos()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select c.ia_usos from public.config_site c where c.id), '{}'::jsonb)
$$;
revoke execute on function public.config_ia_usos() from public;
grant execute on function public.config_ia_usos() to anon, authenticated, service_role;

create or replace function public.admin_salvar_ia_usos(p_usos jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chave text;
  v_valor jsonb;
begin
  perform privado.exigir_admin();
  if p_usos is null or jsonb_typeof(p_usos) <> 'object' then
    raise exception 'Usos inválidos.' using errcode = '22023';
  end if;
  for v_chave, v_valor in select key, value from jsonb_each(p_usos) loop
    if v_chave !~ '^[a-z][a-z_]{1,39}$' or jsonb_typeof(v_valor) <> 'object'
       or (v_valor ? 'ligado' and jsonb_typeof(v_valor -> 'ligado') <> 'boolean')
       or (v_valor ? 'modelo' and coalesce(v_valor ->> 'modelo', '') !~ '^[a-z0-9][a-z0-9.-]{2,60}$')
       or exists (select 1 from jsonb_object_keys(v_valor) k where k not in ('ligado', 'modelo')) then
      raise exception 'Escolha inválida para %.', v_chave using errcode = '22023';
    end if;
  end loop;
  update public.config_site
     set ia_usos = p_usos,
         atualizado_em = now(),
         atualizado_por = (select auth.uid())
   where id;
  perform privado.registrar('salvar_config', 'config', 'ia_usos', 'IA por uso', jsonb_build_object('usos', p_usos));
end
$$;
revoke execute on function public.admin_salvar_ia_usos(jsonb) from public, anon, authenticated;
grant execute on function public.admin_salvar_ia_usos(jsonb) to service_role;

-- o uso da IA, contado por uso (com "_"); o resto como em 20270211120000
alter table privado.uso_da_ia drop constraint if exists uso_da_ia_funcionalidade_check;
alter table privado.uso_da_ia add constraint uso_da_ia_funcionalidade_check check (funcionalidade ~ '^[a-z][a-z_]{1,39}$');

create or replace function public.servidor_contar_uso_da_ia(
  p_chave text,
  p_funcionalidade text,
  p_modelo text,
  p_falhou boolean default false,
  p_entrada integer default 0,
  p_saida integer default 0,
  p_buscas integer default 0
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  perform privado.exigir_servidor(p_chave);
  if coalesce(p_funcionalidade, '') !~ '^[a-z][a-z_]{1,39}$' or char_length(coalesce(p_modelo, '')) not between 1 and 60 then
    raise exception 'Uso inválido.' using errcode = '22023';
  end if;
  insert into privado.uso_da_ia as u (dia, funcionalidade, modelo, chamadas, falhas, tokens_entrada, tokens_saida, buscas)
  values (
    hoje, p_funcionalidade, p_modelo,
    case when p_falhou then 0 else 1 end, case when p_falhou then 1 else 0 end,
    greatest(coalesce(p_entrada, 0), 0), greatest(coalesce(p_saida, 0), 0), least(greatest(coalesce(p_buscas, 0), 0), 100)
  )
  on conflict (dia, funcionalidade, modelo) do update
     set chamadas = u.chamadas + excluded.chamadas,
         falhas = u.falhas + excluded.falhas,
         tokens_entrada = u.tokens_entrada + excluded.tokens_entrada,
         tokens_saida = u.tokens_saida + excluded.tokens_saida,
         buscas = u.buscas + excluded.buscas;
  if random() < 0.01 then
    delete from privado.uso_da_ia where dia < hoje - 400;
  end if;
end
$$;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270907120000_ia_por_uso');
