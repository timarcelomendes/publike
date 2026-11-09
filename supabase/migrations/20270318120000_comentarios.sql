-- Comentários nas vagas (09/11/2026; claude/plano-comentarios-e-indicar-por-email.md, parte 2). Pode rodar de novo.
-- Rode depois de 20270317120000_indicar_por_email.sql.
--
-- Na página da vaga, perguntas sobre a vaga ("Pergunte sobre a vaga: horário, transporte…") e a resposta de quem
-- publicou, em destaque. Um nível de resposta só. Comentário não é candidatura.
-- - Sem telefone, e-mail ou link (o mesmo filtro dos recados). De 2 a 500 letras. Editar até 15 minutos depois.
-- - Com a moderação automática ligada, passa pela IA antes de ir ao ar (como os recados): ofensa, ameaça,
--   discriminação, dado pessoal, golpe e spam. Retido: quem escreveu vê o motivo.
-- - Denúncia (os motivos de sempre): com 3 denúncias, o comentário fica escondido até a equipe ver.
-- - Quem publicou esconde um comentário da própria vaga (a equipe continua vendo) e desliga os comentários da vaga.
-- - Avisos: quem publicou recebe "Fulano comentou na vaga" (sino e celular; e-mail no máximo um por dia); quem
--   comentou recebe a resposta.
-- - Limites: 1 por minuto, 5 por vaga por dia e 20 por dia.
-- Leitura e escrita só pelas funções (security definer, conta_atual()), como os recados.

-- 1. Tabelas ------------------------------------------------------------------------------------------------------
create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  anuncio_id uuid not null references public.anuncios (id) on delete cascade,
  -- a conta (na agência, a agência) e a pessoa que escreveu
  autor_id uuid not null references public.perfis (id) on delete cascade,
  escrito_por uuid references auth.users (id) on delete set null,
  -- a resposta a um comentário (um nível só)
  resposta_a uuid references public.comentarios (id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 2 and 500),
  status text not null default 'revisao' check (status in ('revisao', 'no_ar', 'retido', 'escondido', 'apagado')),
  -- por que ficou retido ou foi tirado (quem escreveu lê)
  motivo text check (motivo is null or char_length(motivo) <= 500),
  criado_em timestamptz not null default now(),
  publicado_em timestamptz,
  editado_em timestamptz,
  apagado_em timestamptz
);
create index if not exists comentarios_vaga_idx on public.comentarios (anuncio_id, criado_em);
create index if not exists comentarios_autor_idx on public.comentarios (autor_id, criado_em desc);
create index if not exists comentarios_resposta_idx on public.comentarios (resposta_a) where resposta_a is not null;

create table if not exists public.denuncias_comentarios (
  id bigint generated always as identity primary key,
  comentario_id uuid not null references public.comentarios (id) on delete cascade,
  autor_id uuid default auth.uid() references public.perfis (id) on delete set null,
  motivo text not null
    check (motivo in ('cobra_taxa', 'golpe', 'enganoso', 'discriminacao', 'ofensivo', 'spam', 'outro')),
  detalhes text check (char_length(detalhes) <= 1000),
  status text not null default 'aberta' check (status in ('aberta', 'procedente', 'improcedente')),
  criado_em timestamptz not null default now(),
  unique (comentario_id, autor_id)
);
create index if not exists denuncias_comentarios_abertas_idx on public.denuncias_comentarios (comentario_id)
  where status = 'aberta';

create table if not exists public.moderacao_ia_comentarios (
  id bigint generated always as identity primary key,
  comentario_id uuid not null references public.comentarios (id) on delete cascade,
  decisao text not null check (decisao in ('aprovado', 'retido', 'erro')),
  categorias text[] not null default '{}',
  explicacao text,
  modelo text,
  criado_em timestamptz not null default now()
);
create index if not exists moderacao_ia_comentarios_idx on public.moderacao_ia_comentarios (comentario_id, criado_em desc);

create table if not exists privado.fila_ia_comentarios (
  comentario_id uuid primary key references public.comentarios (id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente', 'revisando')),
  tentativas smallint not null default 0,
  criado_em timestamptz not null default now(),
  tentar_depois timestamptz not null default now()
);

alter table public.comentarios enable row level security;
alter table public.denuncias_comentarios enable row level security;
alter table public.moderacao_ia_comentarios enable row level security;
alter table privado.fila_ia_comentarios enable row level security;
revoke all on public.comentarios, public.denuncias_comentarios, public.moderacao_ia_comentarios from anon, authenticated;
revoke all on privado.fila_ia_comentarios from public, anon, authenticated;

-- a vaga aceita comentários (quem publicou desliga)
alter table public.anuncios add column if not exists comentarios_ligados boolean not null default true;

-- o aviso do comentário some junto com ele
alter table public.notificacoes add column if not exists comentario_id uuid references public.comentarios (id) on delete cascade;
create index if not exists notificacoes_comentario_idx on public.notificacoes (comentario_id) where comentario_id is not null;

alter table public.registro_equipe drop constraint if exists registro_equipe_alvo_tipo_check;
alter table public.registro_equipe add constraint registro_equipe_alvo_tipo_check
  check (alvo_tipo in ('usuario', 'anuncio', 'config', 'modelo', 'equipe', 'chave', 'avaliacao', 'recado', 'empresa',
                       'comentario'));

-- 2. Apoio --------------------------------------------------------------------------------------------------------
create or replace function privado.motivo_do_comentario(p_categorias text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when 'ofensa' = any (p_categorias) then 'O comentário tem ofensa ou xingamento.'
           when 'ameaca' = any (p_categorias) then 'O comentário tem ameaça.'
           when 'discriminacao' = any (p_categorias) then 'O comentário exclui ou ofende pessoas por quem elas são.'
           when 'dados_pessoais' = any (p_categorias) then 'O comentário expõe dados pessoais de alguém.'
           when 'conteudo_improprio' = any (p_categorias) then 'O comentário tem conteúdo impróprio.'
           when 'golpe' = any (p_categorias) then 'O comentário parece golpe ou cobra para dar trabalho.'
           when 'spam' = any (p_categorias) then 'O comentário parece propaganda ou spam.'
           else 'O comentário não segue as regras do Publike.'
         end
$$;

-- O nome de quem comentou: a pessoa com o nome curto ("Maria S."); empresa, comércio e agência com o nome.
create or replace function privado.nome_no_comentario(p_conta uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.tipo = 'pessoa' then privado.nome_curto(p.nome) else p.nome end
    from public.perfis p where p.id = p_conta
$$;

-- Os avisos de quando o comentário vai ao ar: quem publicou a vaga (comentário novo) ou quem escreveu o comentário
-- respondido (resposta). Ninguém é avisado do próprio comentário.
create or replace function privado.avisar_comentario(p_comentario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comentarios;
  v_vaga record;
  v_pai public.comentarios;
  v_nome text;
  v_trecho text;
begin
  select * into c from public.comentarios x where x.id = p_comentario;
  if not found or c.status <> 'no_ar' then
    return;
  end if;
  select a.id, a.titulo, a.autor_id into v_vaga from public.anuncios a where a.id = c.anuncio_id;
  v_nome := coalesce(privado.nome_no_comentario(c.autor_id), 'Alguém');
  v_trecho := left(regexp_replace(c.texto, '\s+', ' ', 'g'), 90) || case when char_length(c.texto) > 90 then '…' else '' end;
  if c.resposta_a is null then
    if c.autor_id <> v_vaga.autor_id then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link, comentario_id)
      values (v_vaga.autor_id, 'comentario', v_vaga.id, c.autor_id,
              v_nome || ' comentou na vaga ' || left(v_vaga.titulo, 80) || ': “' || v_trecho || '”',
              '/anuncio/' || v_vaga.id || '#comentario-' || c.id, c.id);
    end if;
  else
    select * into v_pai from public.comentarios x where x.id = c.resposta_a;
    if found and v_pai.autor_id <> c.autor_id and v_pai.status = 'no_ar' then
      insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto, link, comentario_id)
      values (v_pai.autor_id, 'comentario_resposta', v_vaga.id, c.autor_id,
              case when c.autor_id = v_vaga.autor_id
                   then v_nome || ', que publicou a vaga, respondeu seu comentário: “' || v_trecho || '”'
                   else v_nome || ' respondeu seu comentário na vaga ' || left(v_vaga.titulo, 80) || ': “' || v_trecho || '”' end,
              '/anuncio/' || v_vaga.id || '#comentario-' || c.id, c.id);
    end if;
  end if;
end
$$;

revoke execute on function
  privado.motivo_do_comentario(text[]),
  privado.nome_no_comentario(uuid),
  privado.avisar_comentario(uuid)
from public;

-- 3. Ler ----------------------------------------------------------------------------------------------------------
-- Os comentários de uma vaga para quem está vendo: os no ar e os da própria conta (em revisão, retidos ou escondidos,
-- com o motivo). Quem publicou vê também os que escondeu. Devolve se a vaga aceita comentários e quem está vendo.
create or replace function public.comentarios_da_vaga(p_anuncio uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := (select public.conta_atual());
  a record;
  v_itens jsonb;
begin
  select an.id, an.autor_id, an.tipo, an.status, an.preenchida_em, an.comentarios_ligados
    into a from public.anuncios an where an.id = p_anuncio;
  if not found or a.tipo <> 'vaga' then
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'resposta_a', c.resposta_a,
           'texto', c.texto,
           'status', c.status,
           'motivo', case when c.autor_id = eu then c.motivo end,
           'criado_em', c.criado_em,
           'editado_em', c.editado_em,
           'autor_id', c.autor_id,
           'nome', coalesce(privado.nome_no_comentario(c.autor_id), 'Conta do Publike'),
           'tipo', p.tipo,
           'foto', p.foto,
           'de_quem_publicou', c.autor_id = a.autor_id,
           'meu', eu is not null and c.autor_id = eu)
         order by c.criado_em), '[]'::jsonb)
    into v_itens
    from (select * from public.comentarios x
           where x.anuncio_id = p_anuncio
             and (x.status = 'no_ar'
                  or (eu is not null and x.autor_id = eu and x.status in ('revisao', 'retido', 'escondido'))
                  or (eu is not null and eu = a.autor_id and x.status = 'escondido'))
           order by x.criado_em
           limit 300) c
    join public.perfis p on p.id = c.autor_id;
  return jsonb_build_object(
    'ligados', a.comentarios_ligados,
    'aberta', a.status = 'ativo' and a.preenchida_em is null,
    'dono', eu is not null and eu = a.autor_id,
    'logado', eu is not null,
    'itens', v_itens);
end
$$;
revoke execute on function public.comentarios_da_vaga(uuid) from public;
grant execute on function public.comentarios_da_vaga(uuid) to anon, authenticated;

-- Quantos comentários no ar cada vaga da conta tem (o painel).
create or replace function public.comentarios_das_minhas_vagas(p_anuncios uuid[])
returns table (anuncio_id uuid, comentarios bigint, sem_resposta bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.anuncio_id, count(*),
         count(*) filter (where c.resposta_a is null and c.autor_id <> a.autor_id
                            and not exists (select 1 from public.comentarios r
                                             where r.resposta_a = c.id and r.autor_id = a.autor_id
                                               and r.status = 'no_ar'))
    from public.comentarios c
    join public.anuncios a on a.id = c.anuncio_id
   where c.anuncio_id = any (p_anuncios[1:200]) and c.status = 'no_ar'
     and a.autor_id = (select public.conta_atual())
   group by c.anuncio_id
$$;
revoke execute on function public.comentarios_das_minhas_vagas(uuid[]) from public, anon;
grant execute on function public.comentarios_das_minhas_vagas(uuid[]) to authenticated;

-- 4. Escrever, editar, apagar --------------------------------------------------------------------------------------
create or replace function public.comentar(p_anuncio uuid, p_texto text, p_resposta_a uuid default null)
returns table (id uuid, status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  conta uuid := (select public.conta_atual());
  pessoa uuid := (select auth.uid());
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '\n{3,}', E'\n\n', 'g'));
  v_status text;
  v_id uuid;
  a record;
begin
  if conta is null or pessoa is null then
    raise exception 'Entre na sua conta para comentar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if not exists (select 1 from public.perfis p where p.id = conta) then
    raise exception 'Complete seu perfil antes de comentar.' using errcode = 'P0001', hint = 'perfil_incompleto';
  end if;
  if char_length(v_texto) < 2 then
    raise exception 'Escreva o comentário.' using errcode = 'P0001', hint = 'texto';
  end if;
  if char_length(v_texto) > 500 then
    raise exception 'O comentário passa de 500 letras.' using errcode = 'P0001', hint = 'texto';
  end if;
  if public.tem_contato(v_texto, true) then
    raise exception 'Tire o telefone, o e-mail ou o link. O contato aparece quando der match.'
      using errcode = 'P0001', hint = 'contato';
  end if;
  select an.id, an.autor_id, an.tipo, an.status, an.preenchida_em, an.comentarios_ligados
    into a from public.anuncios an where an.id = p_anuncio;
  if not found or a.tipo <> 'vaga' then
    raise exception 'Vaga não encontrada.' using errcode = 'P0002';
  end if;
  if a.status <> 'ativo' or a.preenchida_em is not null then
    raise exception 'Essa vaga já foi fechada: não dá para comentar.' using errcode = 'P0001';
  end if;
  if not a.comentarios_ligados then
    raise exception 'Quem publicou desligou os comentários desta vaga.' using errcode = 'P0001';
  end if;
  if p_resposta_a is not null and not exists (
    select 1 from public.comentarios c
     where c.id = p_resposta_a and c.anuncio_id = p_anuncio and c.resposta_a is null and c.status = 'no_ar'
  ) then
    raise exception 'Esse comentário não está mais no ar.' using errcode = 'P0001';
  end if;
  -- os limites: 1 por minuto, 5 por vaga por dia e 20 por dia
  if exists (select 1 from public.comentarios c
              where c.escrito_por = pessoa and c.criado_em > now() - interval '1 minute') then
    raise exception 'Espere um minuto para comentar de novo.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.comentarios c
       where c.escrito_por = pessoa and c.anuncio_id = p_anuncio and c.criado_em > now() - interval '24 hours') >= 5 then
    raise exception 'Você já comentou 5 vezes nesta vaga hoje. Tente de novo amanhã.' using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('comentario', 20, 'Você já comentou 20 vezes hoje. Tente de novo amanhã.');

  v_status := case when coalesce((select c.ia_moderacao from public.config_site c limit 1), false)
                   then 'revisao' else 'no_ar' end;
  insert into public.comentarios (anuncio_id, autor_id, escrito_por, resposta_a, texto, status, publicado_em)
  values (p_anuncio, conta, pessoa, p_resposta_a, v_texto, v_status, case when v_status = 'no_ar' then now() end)
  returning comentarios.id into v_id;
  if v_status = 'revisao' then
    insert into privado.fila_ia_comentarios (comentario_id) values (v_id);
  else
    perform privado.avisar_comentario(v_id);
  end if;
  return query select v_id, v_status;
end
$$;
revoke execute on function public.comentar(uuid, text, uuid) from public, anon;
grant execute on function public.comentar(uuid, text, uuid) to authenticated;

-- Edita o próprio comentário até 15 minutos depois (com a moderação ligada, volta para a IA).
create or replace function public.editar_comentario(p_comentario uuid, p_texto text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '\n{3,}', E'\n\n', 'g'));
  c public.comentarios;
  v_status text;
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select * into c from public.comentarios x where x.id = p_comentario and x.autor_id = conta for update;
  if not found or c.status not in ('no_ar', 'revisao', 'retido') then
    raise exception 'Comentário não encontrado.' using errcode = 'P0002';
  end if;
  if c.criado_em < now() - interval '15 minutes' then
    raise exception 'Dá para editar só até 15 minutos depois. Apague e escreva de novo.' using errcode = 'P0001';
  end if;
  if char_length(v_texto) < 2 or char_length(v_texto) > 500 then
    raise exception 'O comentário tem de 2 a 500 letras.' using errcode = 'P0001', hint = 'texto';
  end if;
  if public.tem_contato(v_texto, true) then
    raise exception 'Tire o telefone, o e-mail ou o link. O contato aparece quando der match.'
      using errcode = 'P0001', hint = 'contato';
  end if;
  if v_texto = c.texto then
    return c.status;
  end if;
  perform privado.conferir_limite('comentario_edicao', 20, 'Você já editou 20 comentários hoje. Tente de novo amanhã.');
  v_status := case when coalesce((select x.ia_moderacao from public.config_site x limit 1), false)
                   then 'revisao' else case when c.status = 'retido' then 'retido' else 'no_ar' end end;
  update public.comentarios
     set texto = v_texto, editado_em = now(), status = v_status,
         motivo = case when v_status = 'revisao' then null else motivo end
   where id = p_comentario;
  if v_status = 'revisao' then
    insert into privado.fila_ia_comentarios (comentario_id) values (p_comentario)
    on conflict (comentario_id) do update set status = 'pendente', tentativas = 0, tentar_depois = now();
  end if;
  return v_status;
end
$$;
revoke execute on function public.editar_comentario(uuid, text) from public, anon;
grant execute on function public.editar_comentario(uuid, text) to authenticated;

-- Apaga o próprio comentário (as respostas a ele somem junto da página).
create or replace function public.apagar_comentario(p_comentario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  update public.comentarios
     set status = 'apagado', apagado_em = now()
   where id = p_comentario and autor_id = conta and status <> 'apagado';
  if not found then
    raise exception 'Comentário não encontrado.' using errcode = 'P0002';
  end if;
  delete from privado.fila_ia_comentarios where comentario_id = p_comentario;
  delete from public.notificacoes n where n.comentario_id = p_comentario;
end
$$;
revoke execute on function public.apagar_comentario(uuid) from public, anon;
grant execute on function public.apagar_comentario(uuid) to authenticated;

-- Quem publicou esconde (ou mostra de novo) um comentário da própria vaga. A equipe continua vendo.
create or replace function public.esconder_comentario(p_comentario uuid, p_esconder boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  c public.comentarios;
begin
  if conta is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  select x.* into c from public.comentarios x
    join public.anuncios a on a.id = x.anuncio_id
   where x.id = p_comentario and a.autor_id = conta
   for update of x;
  if not found or c.status not in ('no_ar', 'escondido') then
    raise exception 'Comentário não encontrado.' using errcode = 'P0002';
  end if;
  if c.autor_id = conta then
    raise exception 'Para tirar o seu comentário, apague.' using errcode = 'P0001';
  end if;
  update public.comentarios
     set status = case when coalesce(p_esconder, true) then 'escondido' else 'no_ar' end,
         motivo = case when coalesce(p_esconder, true) then 'Quem publicou a vaga escondeu este comentário.' end
   where id = p_comentario;
end
$$;
revoke execute on function public.esconder_comentario(uuid, boolean) from public, anon;
grant execute on function public.esconder_comentario(uuid, boolean) to authenticated;

-- Quem publicou liga ou desliga os comentários da vaga.
create or replace function public.ligar_comentarios(p_anuncio uuid, p_ligado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.anuncios set comentarios_ligados = coalesce(p_ligado, true)
   where id = p_anuncio and autor_id = (select public.conta_atual()) and tipo = 'vaga';
  if not found then
    raise exception 'Vaga não encontrada.' using errcode = '42501';
  end if;
end
$$;
revoke execute on function public.ligar_comentarios(uuid, boolean) from public, anon;
grant execute on function public.ligar_comentarios(uuid, boolean) to authenticated;

-- Denuncia um comentário. Com 3 denúncias abertas, ele fica escondido até a equipe ver.
create or replace function public.denunciar_comentario(p_comentario uuid, p_motivo text, p_detalhes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  conta uuid := (select public.conta_atual());
  c public.comentarios;
begin
  if conta is null then
    raise exception 'Entre na sua conta para denunciar.' using errcode = '42501';
  end if;
  if p_motivo not in ('cobra_taxa', 'golpe', 'enganoso', 'discriminacao', 'ofensivo', 'spam', 'outro') then
    raise exception 'Escolha o motivo.' using errcode = 'P0001';
  end if;
  select * into c from public.comentarios x where x.id = p_comentario;
  if not found or c.status <> 'no_ar' then
    raise exception 'Comentário não encontrado.' using errcode = 'P0002';
  end if;
  if c.autor_id = conta then
    raise exception 'Esse comentário é seu: para tirar, apague.' using errcode = 'P0001';
  end if;
  perform privado.conferir_limite('denuncia', 20, 'Você já fez 20 denúncias hoje. Tente de novo amanhã.');
  insert into public.denuncias_comentarios (comentario_id, autor_id, motivo, detalhes)
  values (p_comentario, conta, p_motivo, nullif(left(btrim(coalesce(p_detalhes, '')), 1000), ''))
  on conflict (comentario_id, autor_id) do nothing;
  if (select count(*) from public.denuncias_comentarios d
       where d.comentario_id = p_comentario and d.status = 'aberta') >= 3 then
    update public.comentarios
       set status = 'retido', motivo = 'Escondido depois de denúncias, até a equipe ver.'
     where id = p_comentario and status = 'no_ar';
  end if;
end
$$;
revoke execute on function public.denunciar_comentario(uuid, text, text) from public, anon;
grant execute on function public.denunciar_comentario(uuid, text, text) to authenticated;

-- 5. A fila da IA ---------------------------------------------------------------------------------------------------
create or replace function public.servidor_pegar_comentarios_ia(p_chave text, p_limite integer default 5)
returns table (comentario_id uuid, versao text, texto text, vaga text, respondendo text, de_quem_publicou boolean,
               modelo text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_servidor(p_chave);
  -- travou três vezes: registra o erro e deixa para a equipe (o comentário continua em revisão)
  with esgotados as (
    delete from privado.fila_ia_comentarios f
     where f.status = 'revisando' and f.tentar_depois <= now() and f.tentativas >= 3
    returning f.comentario_id
  )
  insert into public.moderacao_ia_comentarios (comentario_id, decisao, explicacao)
  select e.comentario_id, 'erro', 'A revisão não terminou depois de três tentativas.' from esgotados e;

  return query
  with escolhidos as (
    select f.comentario_id from privado.fila_ia_comentarios f
     where f.tentar_depois <= now() and (f.status = 'pendente' or f.tentativas < 3)
     order by f.criado_em
     limit least(greatest(coalesce(p_limite, 5), 1), 20)
     for update skip locked
  ), marcados as (
    update privado.fila_ia_comentarios f
       set status = 'revisando', tentativas = f.tentativas + 1, tentar_depois = now() + interval '5 minutes'
      from escolhidos e
     where f.comentario_id = e.comentario_id
    returning f.comentario_id
  )
  select c.id, md5(c.texto), c.texto, a.titulo, pai.texto, c.autor_id = a.autor_id, cfg.ia_modelo
    from marcados m
    join public.comentarios c on c.id = m.comentario_id
    join public.anuncios a on a.id = c.anuncio_id
    left join public.comentarios pai on pai.id = c.resposta_a
    cross join public.config_site cfg;
end
$$;
revoke execute on function public.servidor_pegar_comentarios_ia(text, integer) from public;
grant execute on function public.servidor_pegar_comentarios_ia(text, integer) to anon, authenticated, service_role;

create or replace function public.servidor_resultado_comentario(
  p_chave text,
  p_comentario uuid,
  p_versao text,
  p_decisao text,
  p_categorias text[] default '{}',
  p_explicacao text default null,
  p_modelo text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila privado.fila_ia_comentarios;
  c public.comentarios;
  categorias text[];
begin
  perform privado.exigir_servidor(p_chave);
  if p_decisao not in ('aprovado', 'retido', 'erro') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  select * into fila from privado.fila_ia_comentarios f where f.comentario_id = p_comentario for update;
  if not found then
    return 'ignorado';
  end if;
  select * into c from public.comentarios x where x.id = p_comentario for update;
  if not found or c.status <> 'revisao' then
    delete from privado.fila_ia_comentarios where comentario_id = p_comentario;
    return 'ignorado';
  end if;
  if md5(c.texto) is distinct from p_versao then
    update privado.fila_ia_comentarios set status = 'pendente', tentativas = 0, tentar_depois = now()
     where comentario_id = p_comentario;
    return 'desatualizado';
  end if;
  if p_decisao = 'erro' and fila.tentativas < 3 then
    update privado.fila_ia_comentarios
       set status = 'pendente', tentar_depois = now() + fila.tentativas * interval '5 minutes'
     where comentario_id = p_comentario;
    return 'tentar_de_novo';
  end if;
  select coalesce(array_agg(distinct x), '{}') into categorias
    from (select x from unnest(coalesce(p_categorias, '{}')) as x where x ~ '^[a-z_]{2,40}$' limit 8) t;
  delete from privado.fila_ia_comentarios where comentario_id = p_comentario;
  insert into public.moderacao_ia_comentarios (comentario_id, decisao, categorias, explicacao, modelo)
  values (p_comentario, p_decisao, categorias, left(p_explicacao, 1000), left(p_modelo, 80));

  if p_decisao = 'aprovado' then
    update public.comentarios
       set status = 'no_ar', publicado_em = coalesce(publicado_em, now()), motivo = null
     where id = p_comentario;
    -- o aviso só na primeira vez (a edição aprovada não avisa de novo)
    if c.publicado_em is null then
      perform privado.avisar_comentario(p_comentario);
    end if;
  elsif p_decisao = 'retido' then
    update public.comentarios set status = 'retido', motivo = privado.motivo_do_comentario(categorias)
     where id = p_comentario;
  end if;
  return p_decisao;
end
$$;
revoke execute on function public.servidor_resultado_comentario(text, uuid, text, text, text[], text, text) from public;
grant execute on function public.servidor_resultado_comentario(text, uuid, text, text, text[], text, text)
  to anon, authenticated, service_role;

-- 6. A equipe -------------------------------------------------------------------------------------------------------
-- Os comentários que precisam de uma pessoa: retidos (pela IA ou por denúncias), com denúncia aberta, escondidos por
-- quem publicou, ou que a IA não conseguiu revisar.
create or replace function public.fila_comentarios()
returns table (
  comentario_id uuid,
  situacao text,
  texto text,
  status text,
  motivo text,
  autor_id uuid,
  autor_nome text,
  anuncio_id uuid,
  anuncio_titulo text,
  denuncias_abertas integer,
  motivos text[],
  ia_categorias text[],
  ia_explicacao text,
  criado_em timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  perform privado.exigir_equipe();
  return query
    select c.id,
           case when c.status = 'retido' then 'retido'
                when c.status = 'escondido' then 'escondido'
                when c.status = 'revisao' then 'sem_revisao'
                else 'denunciado' end,
           c.texto, c.status, c.motivo, c.autor_id, p.nome, a.id, a.titulo,
           (select count(*)::integer from public.denuncias_comentarios d
             where d.comentario_id = c.id and d.status = 'aberta'),
           coalesce((select array_agg(distinct d.motivo) from public.denuncias_comentarios d
                      where d.comentario_id = c.id and d.status = 'aberta'), '{}'),
           coalesce(ia.categorias, '{}'), ia.explicacao, c.criado_em
      from public.comentarios c
      join public.perfis p on p.id = c.autor_id
      join public.anuncios a on a.id = c.anuncio_id
      left join lateral (
        select m.categorias, m.explicacao from public.moderacao_ia_comentarios m
         where m.comentario_id = c.id order by m.criado_em desc, m.id desc limit 1
      ) ia on true
     where c.status in ('retido', 'escondido')
        or (c.status = 'no_ar' and exists (
              select 1 from public.denuncias_comentarios d where d.comentario_id = c.id and d.status = 'aberta'))
        or (c.status = 'revisao' and not exists (
              select 1 from privado.fila_ia_comentarios f where f.comentario_id = c.id))
     order by (c.status = 'retido') desc, c.criado_em desc
     limit 300;
end
$$;
revoke execute on function public.fila_comentarios() from public, anon;
grant execute on function public.fila_comentarios() to authenticated, service_role;

-- Decisão da equipe: 'liberar' (vai ao ar; as denúncias abertas ficam improcedentes) ou 'remover' (sai, com o motivo
-- no aviso de quem escreveu).
create or replace function public.moderar_comentario(p_comentario uuid, p_decisao text, p_nota text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.comentarios;
  v_nota text := nullif(left(btrim(coalesce(p_nota, '')), 500), '');
begin
  perform privado.exigir_equipe();
  if p_decisao not in ('liberar', 'remover') then
    raise exception 'Decisão inválida.' using errcode = '22023';
  end if;
  if p_decisao = 'remover' and v_nota is null then
    raise exception 'Escreva o motivo para quem escreveu o comentário.' using errcode = '22023';
  end if;
  select * into c from public.comentarios x where x.id = p_comentario for update;
  if not found or c.status = 'apagado' then
    raise exception 'Comentário não encontrado.' using errcode = 'P0002';
  end if;
  delete from privado.fila_ia_comentarios where comentario_id = p_comentario;
  if p_decisao = 'liberar' then
    update public.comentarios
       set status = 'no_ar', publicado_em = coalesce(publicado_em, now()), motivo = null
     where id = p_comentario;
    update public.denuncias_comentarios set status = 'improcedente' where comentario_id = p_comentario and status = 'aberta';
    if c.publicado_em is null then
      perform privado.avisar_comentario(p_comentario);
    end if;
  else
    update public.comentarios set status = 'apagado', apagado_em = now(), motivo = v_nota where id = p_comentario;
    update public.denuncias_comentarios set status = 'procedente' where comentario_id = p_comentario and status = 'aberta';
    delete from public.notificacoes n where n.comentario_id = p_comentario;
  end if;
  perform privado.registrar(case when p_decisao = 'liberar' then 'liberar_comentario' else 'remover_comentario' end,
                            'comentario', p_comentario::text, left(c.texto, 80),
                            jsonb_build_object('autor', c.autor_id, 'vaga', c.anuncio_id, 'nota', v_nota));
end
$$;
revoke execute on function public.moderar_comentario(uuid, text, text) from public, anon;
grant execute on function public.moderar_comentario(uuid, text, text) to authenticated, service_role;

-- 7. Os e-mails dos avisos ------------------------------------------------------------------------------------------
insert into public.modelos_email
  (chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao, assunto_padrao, corpo_padrao, botao_padrao)
select v.chave, v.grupo, v.ordem, v.nome, v.descricao, v.variaveis, v.assunto, v.corpo, v.botao, v.assunto, v.corpo, v.botao
  from (values
    ('comentario', 'usuarios', 49, 'Comentário na vaga',
     'Para quem publicou: alguém comentou numa vaga da conta. No máximo um e-mail por dia (o sino recebe todos).',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Comentaram na sua vaga {{titulo}}',
     E'Oi, {{nome}}.\n\n{{motivo}}\n\nResponder rápido ajuda: a resposta fica na vaga para todo mundo ver, e quem tinha a mesma dúvida se candidata.',
     'Responder'),
    ('comentario_resposta', 'usuarios', 50, 'Resposta ao seu comentário',
     'Para quem comentou numa vaga: alguém (quem publicou, na maioria das vezes) respondeu.',
     array['nome', 'quem', 'titulo', 'motivo', 'link'],
     'Responderam seu comentário na vaga {{titulo}}',
     E'Oi, {{nome}}.\n\n{{motivo}}',
     'Ver a resposta')
  ) as v(chave, grupo, ordem, nome, descricao, variaveis, assunto, corpo, botao)
on conflict (chave) do update
  set nome = excluded.nome, descricao = excluded.descricao, variaveis = excluded.variaveis,
      assunto = case when modelos_email.assunto = modelos_email.assunto_padrao then excluded.assunto
                     else modelos_email.assunto end,
      corpo = case when modelos_email.corpo = modelos_email.corpo_padrao then excluded.corpo
                   else modelos_email.corpo end,
      botao = case when modelos_email.botao = modelos_email.botao_padrao then excluded.botao
                   else modelos_email.botao end,
      assunto_padrao = excluded.assunto_padrao, corpo_padrao = excluded.corpo_padrao,
      botao_padrao = excluded.botao_padrao;

-- no máximo um e-mail de comentário por dia para quem publicou (o sino e o celular recebem todos)
insert into privado.regras_email (modelo, intervalo_min) values ('comentario', 1440)
on conflict (modelo) do nothing;

-- 8. A novidade (publicada hoje; o ponto aparece no menu da conta) -------------------------------------------------
insert into public.novidades (dia, para, titulo, texto, link, botao, publicada)
select (now() at time zone 'America/Sao_Paulo')::date, 'todos', 'Comentários nas vagas',
       'Ficou com dúvida sobre uma vaga? Pergunte nos comentários, embaixo da descrição: quem publicou responde para todo mundo ver. Quem contrata recebe o aviso e pode esconder um comentário ou desligar os comentários da vaga.',
       '/?tipo=vaga', 'Ver vagas', true
 where not exists (select 1 from public.novidades n where n.titulo = 'Comentários nas vagas');

notify pgrst, 'reload schema';
