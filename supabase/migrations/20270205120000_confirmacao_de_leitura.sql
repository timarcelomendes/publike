-- Confirmação de leitura (04/11/2026; claude/plano-confirmacao-de-leitura.md): cada conta escolhe, em Avisos e
-- notificações, se quem mandou vê quando ela leu (os dois tiques). Ligada por padrão e valendo para os dois lados:
-- desligada, ninguém vê quando a conta leu, e ela também não vê quando leram as dela.
--
-- Antes, a mesma marca (`mensagens.lida_em`) contava as não lidas e mostrava o "lida" para quem mandou (que lê
-- essa coluna). Agora a leitura de cada um fica à parte (`privado.mensagens_lidas`, só para as não lidas), e o
-- `lida_em` só é gravado com a confirmação ligada nas duas contas: desligada, nada da leitura chega à outra pessoa,
-- nem pelo aviso ao vivo (a mensagem não muda). Desligar não apaga o "lida" que já apareceu.
--
-- Roda depois de 20270204120000_lida_e_nao_lida.sql. Pode rodar de novo.

do $$
begin
  if to_regclass('privado.conversas_nao_lidas') is null then
    raise exception 'Rode antes a migração 20270204120000_lida_e_nao_lida.sql.';
  end if;
end
$$;

-- 1. As leituras, à parte --------------------------------------------------------------------------
-- numa conversa só há duas contas: quem lê a mensagem é sempre a que não escreveu
create table if not exists privado.mensagens_lidas (
  mensagem_id bigint primary key references public.mensagens (id) on delete cascade,
  lida_em timestamptz not null default now()
);
alter table privado.mensagens_lidas enable row level security;
revoke all on privado.mensagens_lidas from public, anon, authenticated;

-- as leituras de antes (o lida_em delas fica como está: quem mandou já via)
insert into privado.mensagens_lidas (mensagem_id, lida_em)
select m.id, m.lida_em from public.mensagens m where m.lida_em is not null
on conflict (mensagem_id) do nothing;

-- 2. A escolha de cada conta (só guarda quem desligou) --------------------------------------------
create table if not exists privado.leitura_desligada (
  conta_id uuid primary key references public.perfis (id) on delete cascade,
  desde timestamptz not null default now()
);
alter table privado.leitura_desligada enable row level security;
revoke all on privado.leitura_desligada from public, anon, authenticated;

create or replace function privado.confirma_leitura(p_conta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from privado.leitura_desligada d where d.conta_id = p_conta)
$$;
revoke execute on function privado.confirma_leitura(uuid) from public, anon, authenticated;

-- a da minha conta (ligada: true)
create or replace function public.minha_confirmacao_de_leitura()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select privado.confirma_leitura((select public.conta_atual()))
$$;
revoke execute on function public.minha_confirmacao_de_leitura() from public, anon;
grant execute on function public.minha_confirmacao_de_leitura() to authenticated;

-- ligar ou desligar (como os avisos: na conta com equipe, só o dono e quem administra)
create or replace function public.mudar_confirmacao_de_leitura(p_ligada boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null then
    raise exception 'Entre na sua conta para continuar.' using errcode = '42501';
  end if;
  if (select public.papel_na_conta()) not in ('dono', 'admin') then
    raise exception 'Só quem administra a conta muda a confirmação de leitura.' using errcode = '42501';
  end if;
  if coalesce(p_ligada, true) then
    delete from privado.leitura_desligada d where d.conta_id = conta;
  else
    insert into privado.leitura_desligada (conta_id) values (conta) on conflict do nothing;
  end if;
end
$$;
revoke execute on function public.mudar_confirmacao_de_leitura(boolean) from public, anon;
grant execute on function public.mudar_confirmacao_de_leitura(boolean) to authenticated;

-- 3. Abrir a conversa (ou "Marcar como lida"): guarda a leitura; o "lida" para quem mandou, só com as duas ligadas
create or replace function public.marcar_conversa_lida_com(p_outro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
  v_conversa uuid;
  v_confirma boolean;
begin
  if eu is null or p_outro is null or not privado.dupla_ligada(eu, p_outro) then
    return;
  end if;
  select c.id into v_conversa from public.conversas c
   where c.conta_a = least(eu, p_outro) and c.conta_b = greatest(eu, p_outro);
  v_confirma := privado.confirma_leitura(eu) and privado.confirma_leitura(p_outro);
  with novas as (
    insert into privado.mensagens_lidas (mensagem_id)
    select m.id from public.mensagens m
     where m.conversa_id = v_conversa and m.autor_id <> eu
       and not exists (select 1 from privado.mensagens_lidas l where l.mensagem_id = m.id)
    on conflict (mensagem_id) do nothing
    returning mensagem_id
  )
  update public.mensagens m
     set lida_em = now()
    from novas n
   where v_confirma and m.id = n.mensagem_id and m.lida_em is null;
  update public.notificacoes n
     set lida = true
   where n.destinatario_id = eu and n.tipo = 'mensagem' and n.ator_id = p_outro and not n.lida;
  delete from privado.conversas_nao_lidas x where x.conversa_id = v_conversa and x.conta_id = eu;
end
$$;
revoke execute on function public.marcar_conversa_lida_com(uuid) from public, anon;
grant execute on function public.marcar_conversa_lida_com(uuid) to authenticated;

-- 4. As não lidas contam pelas leituras à parte -----------------------------------------------------
-- a de 20270204120000, mudando só a conta das não lidas
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
                             where m.conversa_id = d.id and m.autor_id <> eu.id
                               and not exists (select 1 from privado.mensagens_lidas l
                                                where l.mensagem_id = m.id)), 0),
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

-- a de 20261108120000, mudando só a conta das não lidas
create or replace function public.minhas_conexoes(p_outro uuid default null)
returns table (
  id uuid,
  status text,
  pedi boolean,
  outro_id uuid,
  outro_nome text,
  outro_foto text,
  outro_tipo text,
  outro_cidade text,
  outro_bairro text,
  outro_na_vitrine boolean,
  mensagem text,
  criado_em timestamptz,
  respondida_em timestamptz,
  whatsapp text,
  email text,
  ultima_texto text,
  ultima_em timestamptz,
  ultima_minha boolean,
  nao_lidas integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with eu as (select public.conta_atual() as id)
  select c.id, c.status, c.pedida_por = eu.id,
         o.id,
         case when o.tipo = 'pessoa' and c.status <> 'aceita' then privado.nome_curto(o.nome)
              else privado.nome_nas_conversas(o.id, o.nome, o.tipo) end,
         case when o.tipo = 'pessoa' and c.status <> 'aceita' then null else o.foto end,
         o.tipo, o.cidade, o.bairro,
         exists (select 1 from public.curriculo_na_vitrine n where n.perfil_id = o.id),
         c.mensagem, c.criado_em, c.respondida_em,
         case when c.status = 'aceita' then ct.whatsapp end,
         case when c.status = 'aceita' then ct.email end,
         u.texto, u.criado_em, u.autor_id = eu.id,
         coalesce((select count(*)::integer from public.mensagens m
                    where m.conversa_id = d.id and m.autor_id <> eu.id
                      and not exists (select 1 from privado.mensagens_lidas l where l.mensagem_id = m.id)), 0)
    from eu
    join public.conexoes c on eu.id in (c.talento_id, c.empresa_id)
    join public.perfis o on o.id = case when c.talento_id = eu.id then c.empresa_id else c.talento_id end
    left join public.contatos ct on ct.perfil_id = o.id
    left join public.conversas d
      on c.status = 'aceita'
     and d.conta_a = least(c.talento_id, c.empresa_id) and d.conta_b = greatest(c.talento_id, c.empresa_id)
    left join lateral (
      select m.texto, m.criado_em, m.autor_id
        from public.mensagens m
       where m.conversa_id = d.id
       order by m.criado_em desc, m.id desc
       limit 1
    ) u on true
   where (p_outro is null or o.id = p_outro)
     and not (c.status = 'recusada' and c.pedida_por <> eu.id)
     and (o.suspenso_ate is null or o.suspenso_ate <= now())
     and not privado.ha_bloqueio(eu.id, o.id)
   order by coalesce(u.criado_em, c.respondida_em, c.criado_em) desc
   limit 500
$$;
revoke execute on function public.minhas_conexoes(uuid) from public, anon;
grant execute on function public.minhas_conexoes(uuid) to authenticated;

notify pgrst, 'reload schema';
