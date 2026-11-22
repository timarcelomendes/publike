-- O currículo na semana de volta (22/11/2026; Marcelo: "volta"). A 20270905120000 trocou o aviso semanal por "um aviso a
-- cada 3 novidades" por engano (o pedido "alcançou + 3, novo envio" era do Procuradas sem vaga, 20270906120000). Volta o
-- da 20270904120000: uma vez por semana, de segunda a sexta, das 10h às 19h, com o que aconteceu na semana e uma dica;
-- sem empresa nem convite, só a dica, a cada 4 semanas. O envio continua como estava (desligado). Sai o que a 0905 criou
-- (o número de novidades, a lista dos avisos a cada novidade e as funções dela). Pode rodar de novo.

drop function if exists public.admin_curriculo_semana_ligar(boolean, integer);
drop function if exists privado.curriculo_novidades_destinatarios();
drop table if exists privado.curriculos_avisados;
alter table privado.config_curriculo_semana drop constraint if exists config_curriculo_semana_novidades;
alter table privado.config_curriculo_semana drop column if exists novidades;

-- Quem receberia agora (sem quem já recebeu nesta semana), com o texto
create or replace function privado.curriculo_semana_destinatarios()
returns table (perfil_id uuid, nome text, com_movimento boolean, dica text, texto text)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select c.perfil_id, p.nome, c.atualizado_em, c.experiencias,
           (select count(distinct v.visitante_id) from privado.visitas_perfil v
              join public.perfis q on q.id = v.visitante_id
             where v.perfil_id = c.perfil_id and v.dia > (now() at time zone 'America/Sao_Paulo')::date - 7
               and q.tipo <> 'pessoa') as empresas,
           (select count(*) from public.convites_vaga k
             where k.perfil_id = c.perfil_id and k.criado_em > now() - interval '7 days') as convites,
           (select x ->> 'cargo' from jsonb_array_elements(case when jsonb_typeof(c.experiencias) = 'array'
                                                                then c.experiencias else '[]'::jsonb end) x
             where char_length(btrim(coalesce(x ->> 'descricao', ''))) < 20 and coalesce(x ->> 'cargo', '') <> ''
             limit 1) as sem_descricao,
           (select l.melhorar[1] from privado.leituras_curriculo l where l.perfil_id = c.perfil_id) as melhorar
      from public.curriculos c
      join public.perfis p on p.id = c.perfil_id
     where p.tipo = 'pessoa'
       and (p.suspenso_ate is null or p.suspenso_ate < now())
       and not exists (select 1 from privado.curriculos_avisados_semana a
                        where a.perfil_id = c.perfil_id
                          and a.semana = date_trunc('week', now() at time zone 'America/Sao_Paulo')::date)
  ),
  com_dica as (
    select b.*, (b.empresas > 0 or b.convites > 0) as movimento,
           case
             when b.sem_descricao is not null then 'sem_descricao'
             when b.atualizado_em < now() - interval '45 days' then 'parado'
             when coalesce(b.melhorar, '') <> '' then 'melhorar'
             else ''
           end as dica
      from base b
  )
  select d.perfil_id, d.nome, d.movimento, d.dica,
         case
           when d.movimento then
             'Esta semana, ' ||
             case when d.empresas > 0
                  then case when d.empresas = 1 then '1 empresa abriu' else d.empresas || ' empresas abriram' end
                       || ' o seu currículo'
                  else 'nenhuma empresa abriu o seu currículo' end ||
             case when d.convites > 0
                  then ' e você recebeu ' || case when d.convites = 1 then '1 convite' else d.convites || ' convites' end
                       || ' para vaga'
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
    from com_dica d
   where d.movimento
      or (d.dica <> ''
          -- só a dica: no máximo uma vez a cada 4 semanas
          and not exists (select 1 from privado.curriculos_avisados_semana a
                           where a.perfil_id = d.perfil_id and a.criado_em > now() - interval '27 days'))
$$;
revoke all on function privado.curriculo_semana_destinatarios() from public, anon, authenticated;

-- O envio (pela tarefa das filas) --------------------------------------------------------------------------------------

-- p_agora: o "Mandar agora" do Admin (fora do horário e mesmo desligado)
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
  v_semana date := date_trunc('week', now() at time zone 'America/Sao_Paulo')::date;
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
    if extract(isodow from agora_br) > 5 or extract(hour from agora_br) not between 10 and 18 then
      return 0;
    end if;
  end if;
  for r in
    select d.* from privado.curriculo_semana_destinatarios() d
     limit greatest(1, least(coalesce(p_limite, 100), 300))
  loop
    insert into privado.curriculos_avisados_semana (perfil_id, semana, com_movimento, dica)
    values (r.perfil_id, v_semana, r.com_movimento, r.dica)
    on conflict do nothing;
    continue when not found;
    insert into public.notificacoes (destinatario_id, tipo, texto, link)
    values (r.perfil_id, 'curriculo_semana', r.texto, '/perfil/curriculo');
    n := n + 1;
  end loop;
  return n;
end
$$;
revoke execute on function public.servidor_avisar_curriculos_da_semana(text, integer, boolean) from public;
grant execute on function public.servidor_avisar_curriculos_da_semana(text, integer, boolean) to anon, authenticated, service_role;

-- O Admin: ligar, a prévia (só os números e 3 textos, sem nomes) e o "Mandar agora" ----------------------------------

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
    'receberiam', (select count(*) from privado.curriculo_semana_destinatarios()),
    'com_movimento', (select count(*) from privado.curriculo_semana_destinatarios() d where d.com_movimento),
    'por_dica', coalesce((select jsonb_object_agg(x.dica, x.n)
                            from (select coalesce(nullif(d.dica, ''), 'nenhuma') as dica, count(*) as n
                                    from privado.curriculo_semana_destinatarios() d group by 1) x), '{}'::jsonb),
    'exemplos', coalesce((select jsonb_agg(x.texto)
                            from (select distinct on (d.dica, d.com_movimento) d.texto
                                    from privado.curriculo_semana_destinatarios() d
                                   order by d.dica, d.com_movimento, d.perfil_id limit 4) x), '[]'::jsonb),
    'avisados_na_semana', (select count(*) from privado.curriculos_avisados_semana a
                            where a.semana = date_trunc('week', now() at time zone 'America/Sao_Paulo')::date));
end
$$;

create or replace function public.admin_curriculo_semana_ligar(p_ligado boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_admin();
  update privado.config_curriculo_semana set ligado = coalesce(p_ligado, ligado), atualizado_em = now() where id;
end
$$;
revoke execute on function public.admin_curriculo_semana(), public.admin_curriculo_semana_ligar(boolean) from public, anon;
grant execute on function public.admin_curriculo_semana(), public.admin_curriculo_semana_ligar(boolean) to authenticated;

-- o e-mail: o nome, a descrição e o assunto de antes (o texto continua o mesmo, se o admin não mudou)
update public.modelos_email
   set nome = 'O currículo na semana',
       descricao = 'Para quem tem currículo, uma vez por semana: quantas empresas abriram o currículo, os convites e uma dica (contar falando o que fazia, atualizar ou melhorar). Liga em Admin › Qualificados.',
       assunto = case when assunto = assunto_padrao then 'Seu currículo nesta semana' else assunto end,
       assunto_padrao = 'Seu currículo nesta semana'
 where chave = 'curriculo_semana';

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270910120000_curriculo_da_semana_de_volta');
