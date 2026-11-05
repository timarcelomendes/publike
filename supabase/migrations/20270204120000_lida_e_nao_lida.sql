-- Lida e não lida nas conversas (04/11/2026; claude/plano-lida-nao-lida.md): marcar a conversa como não lida para
-- responder depois (vale só para quem marcou: o "lida" de quem mandou continua). A marca conta nas não lidas (a
-- bolinha, o número do botão Mensagens) até a conversa ser aberta ou marcada como lida. Pode rodar de novo.

create table if not exists privado.conversas_nao_lidas (
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  conta_id uuid not null references public.perfis (id) on delete cascade,
  marcada_em timestamptz not null default now(),
  primary key (conversa_id, conta_id)
);
alter table privado.conversas_nao_lidas enable row level security;
revoke all on privado.conversas_nao_lidas from public, anon, authenticated;

-- marcar como não lida (só a conversa de quem tem match ou conexão com a outra conta)
create or replace function public.marcar_conversa_nao_lida_com(p_outro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_outro is null or not privado.dupla_ligada(eu, p_outro) then
    raise exception 'Conversa não encontrada.' using errcode = 'P0002';
  end if;
  insert into privado.conversas_nao_lidas (conversa_id, conta_id)
  values (privado.conversa_da_dupla(eu, p_outro), eu)
  on conflict (conversa_id, conta_id) do update set marcada_em = now();
end
$$;
revoke execute on function public.marcar_conversa_nao_lida_com(uuid) from public, anon;
grant execute on function public.marcar_conversa_nao_lida_com(uuid) to authenticated;

-- abrir a conversa (ou "Marcar como lida") lê as mensagens e tira a marca
create or replace function public.marcar_conversa_lida_com(p_outro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v_conversa uuid;
begin
  if eu is null or p_outro is null or not privado.dupla_ligada(eu, p_outro) then
    return;
  end if;
  select c.id into v_conversa from public.conversas c
   where c.conta_a = least(eu, p_outro) and c.conta_b = greatest(eu, p_outro);
  update public.mensagens m
     set lida_em = now()
   where m.conversa_id = v_conversa and m.autor_id <> eu and m.lida_em is null;
  update public.notificacoes n
     set lida = true
   where n.destinatario_id = eu and n.tipo = 'mensagem' and n.ator_id = p_outro and not n.lida;
  delete from privado.conversas_nao_lidas x where x.conversa_id = v_conversa and x.conta_id = eu;
end
$$;
revoke execute on function public.marcar_conversa_lida_com(uuid) from public, anon;
grant execute on function public.marcar_conversa_lida_com(uuid) to authenticated;

-- a lista das conversas: a marca entra nas não lidas e vem à parte (a bolinha sem número)
drop function if exists public.conversas_por_pessoa(uuid);
create or replace function public.conversas_por_pessoa(p_outro uuid default null)
returns table (
  outro_id uuid,
  outro_nome text,
  outro_foto text,
  outro_tipo text,
  outro_na_vitrine boolean,
  conversa_id uuid,
  conectados boolean,
  vagas jsonb,
  desde timestamptz,
  ultima_texto text,
  ultima_em timestamptz,
  ultima_minha boolean,
  nao_lidas integer,
  marcada_nao_lida boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id),
  ligacoes as (
    -- anúncio meu, curtido pela outra pessoa
    select c.perfil_id as outro, a.id as anuncio_id, c.perfil_id, a.titulo, a.tipo, 'publiquei'::text as papel,
           coalesce(e.etapa, 'novo') as etapa, coalesce(c.respondida_em, c.criado_em) as desde
      from eu
      join public.anuncios a on a.autor_id = eu.id
      join public.curtidas c on c.anuncio_id = a.id and c.status = 'match'
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where p_outro is null or c.perfil_id = p_outro
    union all
    -- anúncio da outra pessoa, curtido por mim
    select a.autor_id, a.id, c.perfil_id, a.titulo, a.tipo, 'curti', coalesce(e.etapa, 'novo'),
           coalesce(c.respondida_em, c.criado_em)
      from eu
      join public.curtidas c on c.perfil_id = eu.id and c.status = 'match'
      join public.anuncios a on a.id = c.anuncio_id
      left join public.etapas_candidatos e on e.anuncio_id = c.anuncio_id and e.perfil_id = c.perfil_id
     where p_outro is null or a.autor_id = p_outro
    union all
    -- conexão aceita
    select case when x.talento_id = eu.id then x.empresa_id else x.talento_id end, null, null, null, null,
           'conexao', null, coalesce(x.respondida_em, x.criado_em)
      from eu
      join public.conexoes x on eu.id in (x.talento_id, x.empresa_id) and x.status = 'aceita'
     where p_outro is null or p_outro in (x.talento_id, x.empresa_id)
  ),
  pessoas as (
    select l.outro,
           max(l.desde) as desde,
           bool_or(l.papel = 'conexao') as conectados,
           coalesce(jsonb_agg(jsonb_build_object(
                      'anuncio_id', l.anuncio_id, 'perfil_id', l.perfil_id, 'titulo', l.titulo, 'tipo', l.tipo,
                      'papel', l.papel, 'etapa', l.etapa, 'desde', l.desde) order by l.desde desc)
                      filter (where l.anuncio_id is not null),
                    '[]'::jsonb) as vagas
      from ligacoes l
     group by l.outro
  )
  select p.outro, privado.nome_nas_conversas(o.id, o.nome, o.tipo), o.foto, o.tipo,
         exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = o.id),
         d.id, p.conectados, p.vagas, p.desde,
         u.texto, u.criado_em, u.autor_id = eu.id,
         -- a conversa marcada como não lida conta como uma, até ser aberta
         greatest(coalesce((select count(*)::integer from public.mensagens m
                             where m.conversa_id = d.id and m.autor_id <> eu.id and m.lida_em is null), 0),
                  case when x.conta_id is null then 0 else 1 end),
         x.conta_id is not null
    from eu
    cross join pessoas p
    join public.perfis o on o.id = p.outro
    left join public.conversas d on d.conta_a = least(eu.id, p.outro) and d.conta_b = greatest(eu.id, p.outro)
    left join privado.conversas_nao_lidas x on x.conversa_id = d.id and x.conta_id = eu.id
    left join lateral (
      select m.texto, m.criado_em, m.autor_id
        from public.mensagens m
       where m.conversa_id = d.id
       order by m.criado_em desc, m.id desc
       limit 1
    ) u on true
   where p.outro <> eu.id
     and (o.suspenso_ate is null or o.suspenso_ate <= now())
     and not privado.ha_bloqueio(eu.id, p.outro)
   order by coalesce(u.criado_em, p.desde) desc
   limit 500
$$;
revoke execute on function public.conversas_por_pessoa(uuid) from public, anon;
grant execute on function public.conversas_por_pessoa(uuid) to authenticated;

notify pgrst, 'reload schema';
