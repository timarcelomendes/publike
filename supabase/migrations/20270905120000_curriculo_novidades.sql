-- O currículo na semana vira "as novidades do currículo" (22/11/2026; Marcelo: "não pode limitar a um envio por semana,
-- alcançou + 3, novo envio"). Em vez de um aviso por semana, um aviso sempre que juntar 3 novidades desde o último:
-- empresas que abriram o currículo e convites para vaga (no máximo um por dia, das 9h às 20h, todos os dias). Sem
-- novidade, a dica sozinha (contar falando o que fazia, "ainda está procurando?" ou melhorar) continua a cada 4 semanas,
-- no máximo. O nome do aviso e do e-mail continuam ('curriculo_semana'); o texto e o Admin mudam. Começa desligado, como
-- estava (Admin › Qualificados).
--
-- Rode depois de 20270904120000_curriculo_da_semana.sql. Pode rodar de novo.

create table if not exists privado.curriculos_avisados (
  id bigint generated always as identity primary key,
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  empresas integer not null default 0,
  convites integer not null default 0,
  dica text not null default '' check (dica in ('', 'sem_descricao', 'parado', 'melhorar')),
  criado_em timestamptz not null default now()
);
create index if not exists curriculos_avisados_perfil on privado.curriculos_avisados (perfil_id, criado_em desc);
alter table privado.curriculos_avisados enable row level security;
revoke all on privado.curriculos_avisados from public, anon, authenticated;

-- quantas novidades juntam um aviso
alter table privado.config_curriculo_semana add column if not exists novidades integer not null default 3;
alter table privado.config_curriculo_semana drop constraint if exists config_curriculo_semana_novidades;
alter table privado.config_curriculo_semana add constraint config_curriculo_semana_novidades check (novidades between 1 and 20);

drop function if exists privado.curriculo_semana_destinatarios();

-- Quem receberia agora, com o texto: 3 novidades (ou o número do Admin) desde o último aviso (sem aviso, nos últimos 7
-- dias), nada nas últimas 24 horas; ou só a dica, sem aviso nas últimas 4 semanas
create or replace function privado.curriculo_novidades_destinatarios()
returns table (perfil_id uuid, nome text, empresas integer, convites integer, dica text, texto text)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select c.perfil_id, p.nome, c.atualizado_em,
           u.criado_em as ultimo,
           coalesce(u.criado_em, now() - interval '7 days') as desde,
           (select l.melhorar[1] from privado.leituras_curriculo l where l.perfil_id = c.perfil_id) as melhorar,
           (select x ->> 'cargo' from jsonb_array_elements(case when jsonb_typeof(c.experiencias) = 'array'
                                                                then c.experiencias else '[]'::jsonb end) x
             where char_length(btrim(coalesce(x ->> 'descricao', ''))) < 20 and coalesce(x ->> 'cargo', '') <> ''
             limit 1) as sem_descricao
      from public.curriculos c
      join public.perfis p on p.id = c.perfil_id
      left join lateral (select a.criado_em from privado.curriculos_avisados a
                          where a.perfil_id = c.perfil_id order by a.criado_em desc limit 1) u on true
     where p.tipo = 'pessoa'
       and (p.suspenso_ate is null or p.suspenso_ate < now())
       and (u.criado_em is null or u.criado_em < now() - interval '24 hours')
  ),
  contas as (
    select b.*,
           (select count(distinct v.visitante_id)::integer from privado.visitas_perfil v
              join public.perfis q on q.id = v.visitante_id
             where v.perfil_id = b.perfil_id and v.ultima > b.desde and q.tipo <> 'pessoa') as empresas,
           (select count(*)::integer from public.convites_vaga k
             where k.perfil_id = b.perfil_id and k.criado_em > b.desde) as convites,
           case
             when b.sem_descricao is not null then 'sem_descricao'
             when b.atualizado_em < now() - interval '45 days' then 'parado'
             when coalesce(b.melhorar, '') <> '' then 'melhorar'
             else ''
           end as dica
      from base b
  )
  select d.perfil_id, d.nome, d.empresas, d.convites, d.dica,
         case
           when d.empresas + d.convites >= (select c.novidades from privado.config_curriculo_semana c where c.id) then
             case when d.ultimo is null then 'Nos últimos 7 dias, ' else 'Desde o último aviso, ' end ||
             case when d.empresas > 0
                  then case when d.empresas = 1 then '1 empresa abriu' else d.empresas || ' empresas abriram' end
                       || ' o seu currículo'
                  else 'nenhuma empresa abriu o seu currículo' end ||
             case when d.convites > 0
                  then case when d.empresas > 0 then ' e você' else ', mas você' end || ' recebeu '
                       || case when d.convites = 1 then '1 convite' else d.convites || ' convites' end || ' para vaga'
                  else '' end || '.'
           else 'Seu currículo está no Publike, e as empresas da região procuram por função.'
         end ||
         case d.dica
           when 'sem_descricao' then ' A experiência de ' || left(d.sem_descricao, 60) || ' ainda não diz o que você fazia: abra o'
                                     || ' currículo e toque em “Contar falando”. Em 1 minuto, as empresas entendem o seu trabalho.'
           when 'parado' then ' Ainda está procurando? Mudou de trabalho? Atualize o currículo em 1 minuto: as empresas'
                              || ' chamam primeiro quem está em dia.'
           when 'melhorar' then ' Uma dica para chamar mais atenção: ' || left(d.melhorar, 200)
           else ''
         end
    from contas d
   where d.empresas + d.convites >= (select c.novidades from privado.config_curriculo_semana c where c.id)
      or (d.dica <> '' and (d.ultimo is null or d.ultimo < now() - interval '27 days'))
$$;
revoke all on function privado.curriculo_novidades_destinatarios() from public, anon, authenticated;

create or replace function public.servidor_avisar_curriculos_da_semana(p_chave text, p_limite integer default 100, p_agora boolean default false)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  cfg privado.config_curriculo_semana;
  agora_br timestamp := now() at time zone 'America/Sao_Paulo';
  r record;
  n integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  select * into cfg from privado.config_curriculo_semana where id;
  if not found then
    return 0;
  end if;
  if not coalesce(p_agora, false) then
    if not cfg.ligado then
      return 0;
    end if;
    -- todos os dias, das 9h às 20h
    if extract(hour from agora_br) not between 9 and 19 then
      return 0;
    end if;
  end if;
  for r in
    select d.* from privado.curriculo_novidades_destinatarios() d
     limit greatest(1, least(coalesce(p_limite, 100), 300))
  loop
    insert into privado.curriculos_avisados (perfil_id, empresas, convites, dica)
    values (r.perfil_id, r.empresas, r.convites, r.dica);
    insert into public.notificacoes (destinatario_id, tipo, texto, link)
    values (r.perfil_id, 'curriculo_semana', r.texto, '/perfil/curriculo');
    n := n + 1;
  end loop;
  return n;
end
$$;

create or replace function public.admin_curriculo_semana()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  return jsonb_build_object(
    'ligado', (select c.ligado from privado.config_curriculo_semana c where c.id),
    'novidades', (select c.novidades from privado.config_curriculo_semana c where c.id),
    'receberiam', (select count(*) from privado.curriculo_novidades_destinatarios()),
    'com_movimento', (select count(*) from privado.curriculo_novidades_destinatarios() d
                       where d.empresas + d.convites >= (select c.novidades from privado.config_curriculo_semana c where c.id)),
    'por_dica', coalesce((select jsonb_object_agg(x.dica, x.n)
                            from (select coalesce(nullif(d.dica, ''), 'nenhuma') as dica, count(*) as n
                                    from privado.curriculo_novidades_destinatarios() d group by 1) x), '{}'::jsonb),
    'exemplos', coalesce((select jsonb_agg(x.texto)
                            from (select distinct on (d.dica, d.empresas + d.convites > 0) d.texto
                                    from privado.curriculo_novidades_destinatarios() d
                                   order by d.dica, d.empresas + d.convites > 0, d.perfil_id limit 4) x), '[]'::jsonb),
    'avisados_7_dias', (select count(*) from privado.curriculos_avisados a where a.criado_em > now() - interval '7 days'));
end
$$;

create or replace function public.admin_curriculo_semana_ligar(p_ligado boolean, p_novidades integer default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update privado.config_curriculo_semana
     set ligado = coalesce(p_ligado, ligado),
         novidades = coalesce(least(greatest(p_novidades, 1), 20), novidades),
         atualizado_em = now()
   where id;
end
$$;
drop function if exists public.admin_curriculo_semana_ligar(boolean);
revoke execute on function public.admin_curriculo_semana(), public.admin_curriculo_semana_ligar(boolean, integer) from public, anon;
grant execute on function public.admin_curriculo_semana(), public.admin_curriculo_semana_ligar(boolean, integer) to authenticated;

-- o e-mail: o nome e a descrição dizem o jeito novo (o texto continua o mesmo, se o admin não mudou)
update public.modelos_email
   set nome = 'As novidades do currículo',
       descricao = 'Para quem tem currículo, sempre que juntar 3 novidades desde o último aviso (empresas que abriram o currículo e convites; no máximo um por dia), com uma dica. Sem novidade, só a dica, a cada 4 semanas. Liga em Admin › Qualificados.',
       assunto = case when assunto = assunto_padrao then 'Novidades do seu currículo' else assunto end,
       assunto_padrao = 'Novidades do seu currículo'
 where chave = 'curriculo_semana';

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270905120000_curriculo_novidades');
