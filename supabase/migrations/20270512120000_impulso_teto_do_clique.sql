-- O teto do clique em Admin › Impulsos › Regras e o fim da campanha sempre igual ao do banco (13/11/2026). Pedido do
-- Marcelo ("sim", ao campo no admin, depois do diagnóstico em claude/diagnostico-impulsos-sem-cliques.md).
--
-- 1. O teto do clique (config_impulso.teto_clique): o impulso nascia com R$ 2 fixos no código, e mudar o teto dos que
--    estavam no ar era campanha por campanha no Google Ads. Agora o teto das Regras vale para o impulso que nasce e,
--    salvo um teto novo (teto_desde), o robô leva o novo a cada campanha no ar (servidor_teto_do_impulso; teto_em marca
--    quando a campanha recebeu o teto, das Regras ou do ajuste diário, e o mais novo vale). O ajuste diário continua
--    subindo e descendo o lance a partir dele, até o teto do ajuste (motor_teto_clique).
-- 2. O fim da campanha no Google sai do banco a cada medida (impulsos.ts, acertarCampanha): o prazo estendido no banco
--    chega ao Google sozinho. Sem migração para isso.
-- Pode rodar de novo.

alter table privado.config_impulso
  add column if not exists teto_clique numeric(6,2) not null default 2 check (teto_clique between 0.5 and 10),
  add column if not exists teto_desde timestamptz;
alter table privado.impulsos add column if not exists teto_em timestamptz;
alter table privado.impulso_campanhas add column if not exists teto_em timestamptz;

-- teto novo nas Regras: a hora da mudança, para o robô levar aos que estão no ar
create or replace function privado.teto_do_clique_mudou()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.teto_clique is distinct from old.teto_clique then
    new.teto_desde := now();
  end if;
  return new;
end
$$;
drop trigger if exists teto_do_clique_mudou on privado.config_impulso;
create trigger teto_do_clique_mudou before update on privado.config_impulso
  for each row execute function privado.teto_do_clique_mudou();

-- O teto de agora e as campanhas no ar que ainda não têm o teto mudado nas Regras (até 20 por volta).
create or replace function public.servidor_teto_do_impulso(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c privado.config_impulso;
begin
  perform privado.exigir_servidor(p_chave);
  select * into c from privado.config_impulso where id;
  return jsonb_build_object(
    'teto', c.teto_clique,
    'campanhas', coalesce((
      select jsonb_agg(x) from (
        select 'impulso' as tipo, i.id, i.codigo, i.campanha_id, i.conta_google
          from privado.impulsos i
         where c.teto_desde is not null and i.situacao = 'no_ar' and i.campanha_cliente_id is null
           and i.campanha_id is not null and c.teto_desde > coalesce(i.teto_em, i.aprovado_em, '-infinity')
        union all
        select 'cliente', k.id, k.codigo, k.campanha_id, k.conta_google
          from privado.impulso_campanhas k
         where c.teto_desde is not null and k.situacao = 'no_ar' and k.campanha_id is not null
           and c.teto_desde > coalesce(k.teto_em, k.aprovado_em, '-infinity')
        limit 20) x), '[]'::jsonb));
end
$$;

-- A campanha recebeu um teto (das Regras ou do ajuste diário).
create or replace function public.servidor_teto_aplicado(p_chave text, p_tipo text, p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_servidor(p_chave);
  if p_tipo = 'impulso' then
    update privado.impulsos set teto_em = now() where id = p_id;
  elsif p_tipo = 'cliente' then
    update privado.impulso_campanhas set teto_em = now() where id = p_id;
  end if;
end
$$;

revoke execute on function public.servidor_teto_do_impulso(text), public.servidor_teto_aplicado(text, text, uuid) from public;
grant execute on function public.servidor_teto_do_impulso(text), public.servidor_teto_aplicado(text, text, uuid)
  to anon, authenticated, service_role;

-- A mesma de 20270509120000, com o teto do clique
create or replace function public.admin_salvar_impulso(p_precos jsonb, p_config jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  l jsonb;
begin
  perform privado.exigir_impulsos_admin();
  for l in select * from jsonb_array_elements(coalesce(p_precos, '[]'::jsonb)) loop
    update privado.precos_impulso
       set valor = (l ->> 'valor')::numeric, verba = (l ->> 'verba')::numeric, ligado = (l ->> 'ligado')::boolean
     where dias = (l ->> 'dias')::smallint;
  end loop;
  if p_config is not null then
    update privado.config_impulso
       set cortesia_ligada = coalesce((p_config ->> 'cortesia_ligada')::boolean, cortesia_ligada),
           cortesia_dias = coalesce((p_config ->> 'cortesia_dias')::smallint, cortesia_dias),
           cortesia_verba = coalesce((p_config ->> 'cortesia_verba')::numeric, cortesia_verba),
           raio_capital = coalesce((p_config ->> 'raio_capital')::smallint, raio_capital),
           raio_outras = coalesce((p_config ->> 'raio_outras')::smallint, raio_outras),
           auto_ligado = coalesce((p_config ->> 'auto_ligado')::boolean, auto_ligado),
           auto_verba_mes = coalesce((p_config ->> 'auto_verba_mes')::numeric, auto_verba_mes),
           auto_dias = coalesce((p_config ->> 'auto_dias')::smallint, auto_dias),
           auto_verba = coalesce((p_config ->> 'auto_verba')::numeric, auto_verba),
           auto_simultaneos = coalesce((p_config ->> 'auto_simultaneos')::smallint, auto_simultaneos),
           auto_avisar = coalesce((p_config ->> 'auto_avisar')::boolean, auto_avisar),
           motor_ligado = coalesce((p_config ->> 'motor_ligado')::boolean, motor_ligado),
           motor_teto_clique = coalesce((p_config ->> 'motor_teto_clique')::numeric, motor_teto_clique),
           motor_raio_max = coalesce((p_config ->> 'motor_raio_max')::smallint, motor_raio_max),
           teto_clique = coalesce((p_config ->> 'teto_clique')::numeric, teto_clique)
     where id;
  end if;
  perform privado.registrar('precos_impulso', 'config', 'impulso', 'Preços e regras do impulso',
                            jsonb_build_object('precos', p_precos, 'config', p_config));
end
$$;

notify pgrst, 'reload schema';
