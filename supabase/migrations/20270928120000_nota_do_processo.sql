-- A nota do processo seletivo (25/11/2026; Marcelo, com o que o mercado já tem: o candidato avalia como a empresa
-- conduziu a seleção). Pode rodar de novo.
--
-- Quem se candidatou a uma vaga avalia o processo de 1 a 5, com comentário opcional, quando a empresa respondeu
-- (aceitou, dispensou ou desfez) ou quando a candidatura espera há 7 dias ou mais sem resposta. Uma avaliação por
-- vaga (dá para mudar depois). Usa a mesma tabela, a mesma moderação por IA, a mesma resposta pública e a mesma
-- denúncia das avaliações de serviço; a coluna "tipo" separa as duas notas.
--
-- Em público, a avaliação do processo é anônima ("Quem se candidatou", sem foto): quem avalia a empresa que pode
-- contratá-lo amanhã não precisa se expor. A empresa também não vê quem foi. A equipe vê na moderação.

alter table public.avaliacoes add column if not exists tipo text not null default 'servico';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'avaliacoes_tipo_check') then
    alter table public.avaliacoes add constraint avaliacoes_tipo_check check (tipo in ('servico', 'processo'));
  end if;
end
$$;
create index if not exists avaliacoes_processo_idx on public.avaliacoes (profissional_id, criado_em desc)
  where tipo = 'processo' and status = 'publicada';

comment on column public.avaliacoes.tipo is
  'servico: o cliente avalia o profissional depois do match. processo: quem se candidatou avalia o processo seletivo da vaga (anônimo em público).';

-- Quem pode avaliar o processo de uma vaga.
create or replace function privado.pode_avaliar_processo(p_anuncio uuid, p_perfil uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.curtidas c
      join public.anuncios a on a.id = c.anuncio_id
     where c.anuncio_id = p_anuncio and c.perfil_id = p_perfil and a.tipo = 'vaga' and a.autor_id <> p_perfil
       and (c.status in ('match', 'dispensada', 'desfeito')
            or (c.status = 'pendente' and c.criado_em <= now() - interval '7 days'))
  )
$$;

create or replace function public.posso_avaliar_processo(p_anuncio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and privado.pode_avaliar_processo(p_anuncio, (select auth.uid()))
$$;

-- avaliar: o serviço como antes; a vaga, o processo seletivo
create or replace function public.avaliar(p_anuncio uuid, p_nota integer, p_comentario text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  usuario uuid := (select auth.uid());
  a public.anuncios;
  atual public.avaliacoes;
  texto text := nullif(btrim(regexp_replace(coalesce(p_comentario, ''), '[ \t]+', ' ', 'g')), '');
  v_id bigint;
  v_tipo text;
  esperar boolean := false;
begin
  if usuario is null then
    raise exception 'Entre na sua conta para avaliar.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  if p_nota is null or p_nota not between 1 and 5 then
    raise exception 'Escolha de 1 a 5 estrelas.' using errcode = 'P0001';
  end if;
  if char_length(texto) > 600 then
    raise exception 'Use no máximo 600 letras no comentário.' using errcode = 'P0001';
  end if;
  if public.tem_contato(texto, true) then
    raise exception 'Tire o telefone, e-mail ou link do comentário.' using errcode = 'P0001', hint = 'contato_no_texto';
  end if;
  select * into a from public.anuncios where id = p_anuncio;
  if not found or a.tipo not in ('servico', 'vaga') then
    raise exception 'Só dá para avaliar serviços e processos seletivos.' using errcode = 'P0001';
  end if;
  if a.tipo = 'servico' then
    v_tipo := 'servico';
    if not exists (
      select 1 from public.curtidas c
       where c.anuncio_id = p_anuncio and c.perfil_id = usuario
         and (c.status = 'match' or (c.status = 'desfeito' and c.desfeito_por = a.autor_id))
    ) then
      raise exception 'Só avalia quem deu match com este serviço.' using errcode = 'P0001', hint = 'sem_match';
    end if;
  else
    v_tipo := 'processo';
    if not privado.pode_avaliar_processo(p_anuncio, usuario) then
      raise exception 'Só avalia o processo quem se candidatou e teve resposta (ou esperou 7 dias).'
        using errcode = 'P0001', hint = 'sem_processo';
    end if;
  end if;

  select * into atual from public.avaliacoes v where v.anuncio_id = p_anuncio and v.autor_id = usuario for update;
  if found then
    if atual.status in ('retida', 'removida') then
      raise exception 'Sua avaliação está com a moderação e não pode ser mudada agora.' using errcode = 'P0001';
    end if;
    if atual.nota = p_nota and atual.comentario is not distinct from texto then
      return atual.status;
    end if;
    update public.avaliacoes
       set nota = p_nota, comentario = texto, atualizado_em = now(),
           status = case when texto is null then 'publicada' else 'pendente' end
     where id = atual.id
    returning id into v_id;
  else
    perform privado.conferir_limite('avaliacao', 20, 'Você avaliou muitas vezes hoje. Tente de novo amanhã.');
    insert into public.avaliacoes (anuncio_id, profissional_id, autor_id, titulo_servico, nota, comentario, status, tipo)
    values (p_anuncio, a.autor_id, usuario, left(a.titulo, 90), p_nota, texto,
            case when texto is null then 'publicada' else 'pendente' end, v_tipo)
    returning id into v_id;
  end if;

  if texto is not null then
    esperar := privado.mandar_avaliacao_para_ia(v_id, 'comentario');
    if not esperar then
      update public.avaliacoes set status = 'publicada' where id = v_id;
    end if;
  else
    delete from privado.fila_ia_avaliacoes where avaliacao_id = v_id and parte = 'comentario';
  end if;
  perform privado.avisar_avaliacao_publicada(v_id);
  return case when esperar then 'pendente' else 'publicada' end;
end
$$;

-- o aviso: no processo, sem dizer quem foi
create or replace function privado.avisar_avaliacao_publicada(p_avaliacao bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.avaliacoes;
  quem text;
begin
  update public.avaliacoes set publicada_em = now()
   where id = p_avaliacao and status = 'publicada' and publicada_em is null
  returning * into v;
  if not found then
    return;
  end if;
  if v.tipo = 'processo' then
    insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
    values (v.profissional_id, 'avaliacao', v.anuncio_id, null,
            'Quem se candidatou avaliou o processo seletivo de “' || v.titulo_servico || '” com ' || v.nota
            || case when v.nota = 1 then ' estrela.' else ' estrelas.' end);
    return;
  end if;
  select p.nome into quem from public.perfis p where p.id = v.autor_id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (v.profissional_id, 'avaliacao', v.anuncio_id, v.autor_id,
          coalesce(split_part(quem, ' ', 1), 'Alguém') || ' avaliou você com ' || v.nota
          || case when v.nota = 1 then ' estrela' else ' estrelas' end
          || ' em “' || v.titulo_servico || '”.');
end
$$;

-- a nota do profissional continua só dos serviços
create or replace function public.avaliacoes_publicas(p_profissional uuid, p_limite integer default 50)
returns table (
  id bigint,
  nota smallint,
  comentario text,
  titulo_servico text,
  anuncio_id uuid,
  criado_em timestamptz,
  autor_nome text,
  autor_foto text,
  resposta text,
  respondida_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.nota, v.comentario, v.titulo_servico, v.anuncio_id, v.criado_em,
         split_part(p.nome, ' ', 1), p.foto,
         case when v.resposta_status = 'publicada' then v.resposta end,
         case when v.resposta_status = 'publicada' then v.respondida_em end
    from public.avaliacoes v
    join public.perfis p on p.id = v.autor_id
   where v.profissional_id = p_profissional and v.status = 'publicada' and v.tipo = 'servico'
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
   order by v.criado_em desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;

create or replace function public.nota_do_profissional(p_profissional uuid)
returns table (media numeric, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select round(avg(v.nota)::numeric, 1), count(*)::integer
    from public.avaliacoes v
   where v.profissional_id = p_profissional and v.status = 'publicada' and v.tipo = 'servico'
$$;

-- o processo seletivo de quem contrata: anônimo
create or replace function public.avaliacoes_do_processo(p_empresa uuid, p_limite integer default 50)
returns table (
  id bigint,
  nota smallint,
  comentario text,
  titulo_servico text,
  anuncio_id uuid,
  criado_em timestamptz,
  autor_nome text,
  autor_foto text,
  resposta text,
  respondida_em timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.nota, v.comentario, v.titulo_servico, v.anuncio_id, v.criado_em,
         'Quem se candidatou'::text, null::text,
         case when v.resposta_status = 'publicada' then v.resposta end,
         case when v.resposta_status = 'publicada' then v.respondida_em end
    from public.avaliacoes v
    join public.perfis p on p.id = v.autor_id
   where v.profissional_id = p_empresa and v.status = 'publicada' and v.tipo = 'processo'
     and (p.suspenso_ate is null or p.suspenso_ate <= now())
   order by v.criado_em desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;

create or replace function public.nota_do_processo(p_empresa uuid)
returns table (media numeric, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select round(avg(v.nota)::numeric, 1), count(*)::integer
    from public.avaliacoes v
   where v.profissional_id = p_empresa and v.status = 'publicada' and v.tipo = 'processo'
$$;

-- as recebidas: no processo, sem o nome nem a foto de quem avaliou
create or replace function public.minhas_avaliacoes_recebidas()
returns table (
  id bigint,
  nota smallint,
  comentario text,
  titulo_servico text,
  anuncio_id uuid,
  criado_em timestamptz,
  autor_nome text,
  autor_foto text,
  resposta text,
  resposta_status text,
  denunciada boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.nota, v.comentario, v.titulo_servico, v.anuncio_id, v.criado_em,
         case when v.tipo = 'processo' then 'Quem se candidatou' else split_part(p.nome, ' ', 1) end,
         case when v.tipo = 'processo' then null else p.foto end,
         v.resposta, v.resposta_status, v.denunciada_em is not null
    from public.avaliacoes v
    join public.perfis p on p.id = v.autor_id
   where v.profissional_id = (select auth.uid()) and v.status = 'publicada'
   order by v.criado_em desc
$$;

revoke execute on function privado.pode_avaliar_processo(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.posso_avaliar_processo(uuid) from public, anon;
grant execute on function public.posso_avaliar_processo(uuid) to authenticated;
grant execute on function public.avaliacoes_do_processo(uuid, integer), public.nota_do_processo(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

select privado.migracao_aplicada('20270928120000_nota_do_processo');
