-- O orgânico (18/11/2026, claude/plano-organico.md). Pode rodar de novo sem problema.
-- Até aqui, privado.origens só guardava a campanha do link (utm): quem chegava pela busca do Google, pelo Gemini, por
-- um link de outro site ou digitando o endereço ficava sem linha, e o admin mostrava tudo junto como "direto". Agora a
-- conta nova guarda também:
--   chegada: de onde a pessoa chegou sem campanha, pelo referer da primeira página ("busca:google", "ia:gemini",
--            "rede:instagram", "whatsapp", "site:sine_go_gov_br") ou "direto" (sem referer);
--   entrada: o caminho da página de entrada ("/vagas/goiania/frentista"; nos links com código, só o começo: "/convite/*").
-- A campanha continua em `origem` (agora pode ficar vazia, quando só há a chegada). Os Resultados de quem contrata
-- (numeros_origem) leem só `origem`: sem campanha, seguem dizendo "Acharam a vaga no Publike".

alter table privado.origens alter column origem drop not null;
alter table privado.origens add column if not exists chegada text;
alter table privado.origens add column if not exists entrada text;

do $$
begin
  alter table privado.origens
    add constraint origens_chegada_formato check (chegada ~ '^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$');
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table privado.origens add constraint origens_entrada_formato check (entrada ~ '^/[A-Za-z0-9/_.~%*-]{0,199}$');
exception when duplicate_object then null;
end
$$;

do $$
begin
  alter table privado.origens add constraint origens_campanha_ou_chegada check (origem is not null or chegada is not null);
exception when duplicate_object then null;
end
$$;

-- Chamada logo depois de entrar. Só conta conta criada nas últimas 2 horas: quem já tinha conta e clicou no anúncio não
-- vira "cadastro da campanha". Vale a primeira. O valor fora do formato fica de fora (não derruba a entrada).
drop function if exists public.registrar_origem(text);
create or replace function public.registrar_origem(p_origem text default null, p_chegada text default null,
                                                   p_entrada text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  formato constant text := '^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$';
  v_origem text := case when p_origem ~ formato then p_origem end;
  v_chegada text := case when p_chegada ~ formato then p_chegada end;
  v_entrada text := case when p_entrada ~ '^/[A-Za-z0-9/_.~%*-]{0,199}$' then p_entrada end;
begin
  if usuario is null or (v_origem is null and v_chegada is null) then
    return;
  end if;
  if not exists (select 1 from auth.users u where u.id = usuario and u.created_at > now() - interval '2 hours') then
    return;
  end if;
  insert into privado.origens (usuario_id, origem, chegada, entrada)
  values (usuario, v_origem, v_chegada, v_entrada)
  on conflict do nothing;
end
$$;
revoke execute on function public.registrar_origem(text, text, text) from public, anon;
grant execute on function public.registrar_origem(text, text, text) to authenticated;

-- Admin: por origem, quantas contas, quantas publicaram vaga ou serviço e quantos anúncios estão no ar. A origem é a
-- campanha (`campanha` true); sem ela, a chegada; sem as duas, "sem-registro" (as contas de antes desta migração e quem
-- entrou sem os cookies). Antes, as sem campanha saíam todas como "direto".
drop function if exists public.admin_origens(timestamptz);
create function public.admin_origens(p_desde timestamptz default null)
returns table(origem text, campanha boolean, contas bigint, publicaram_vaga bigint, publicaram_servico bigint,
              anuncios_no_ar bigint, primeira timestamptz, ultima timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
    with contas as (
      select u.id, coalesce(o.origem, o.chegada, 'sem-registro') as origem, (o.origem is not null) as campanha,
             u.created_at
        from auth.users u
        left join privado.origens o on o.usuario_id = u.id
       where p_desde is null or u.created_at >= p_desde
    )
    select c.origem,
           c.campanha,
           count(*),
           count(*) filter (where exists (select 1 from public.anuncios a where a.autor_id = c.id and a.tipo = 'vaga')),
           count(*) filter (where exists (select 1 from public.anuncios a where a.autor_id = c.id and a.tipo = 'servico')),
           coalesce(sum((select count(*) from public.anuncios a where a.autor_id = c.id and a.status = 'ativo')), 0)::bigint,
           min(c.created_at),
           max(c.created_at)
      from contas c
     group by c.origem, c.campanha
     order by (c.origem = 'sem-registro'), (c.origem = 'direto'), count(*) desc;
end
$$;
revoke execute on function public.admin_origens(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_origens(timestamptz) to service_role;

-- Admin: por onde entraram as contas novas (a página de entrada, com a origem de cada uma). O site junta os caminhos
-- por tipo de página (src/lib/origem.ts, tipoDaEntrada) e mostra as páginas que mais trouxeram contas.
create or replace function public.admin_entradas(p_desde timestamptz default null)
returns table(origem text, entrada text, contas bigint, publicaram_vaga bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_admin();
  return query
    select coalesce(o.origem, o.chegada) as origem,
           o.entrada,
           count(*),
           count(*) filter (where exists (select 1 from public.anuncios a where a.autor_id = u.id and a.tipo = 'vaga'))
      from privado.origens o
      join auth.users u on u.id = o.usuario_id
     where o.entrada is not null
       and (p_desde is null or u.created_at >= p_desde)
     group by 1, 2
     order by count(*) desc, 2;
end
$$;
revoke execute on function public.admin_entradas(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_entradas(timestamptz) to service_role;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270802120000_origem_organica');
