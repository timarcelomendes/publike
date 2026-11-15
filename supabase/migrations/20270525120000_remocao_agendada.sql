-- A remoção agendada de um anúncio pela moderação (14/11/2026, Marcelo: "agendar remoçao, em 7h, 3h e 24h"), para o caso
-- da denúncia "Não responde": a equipe avisa quem publicou e agenda a saída do ar. Na hora marcada, o robô das filas
-- remove como o botão Remover (o motivo vai para quem publicou e as denúncias abertas fecham como procedentes). Com
-- "só se não responder", a remoção não acontece se não houver mais candidato esperando resposta na vaga.
--
-- Pode rodar de novo.

create table if not exists privado.remocoes_agendadas (
  anuncio_id uuid primary key references public.anuncios (id) on delete cascade,
  remover_em timestamptz not null,
  nota text,
  so_sem_resposta boolean not null default true,
  -- agendada; feita (saiu do ar); respondeu (não saiu: ninguém mais esperando); cancelada (pela equipe)
  situacao text not null default 'agendada' check (situacao in ('agendada', 'feita', 'respondeu', 'cancelada')),
  agendada_por uuid,
  criada_em timestamptz not null default now(),
  resolvida_em timestamptz
);
alter table privado.remocoes_agendadas enable row level security;
revoke all on privado.remocoes_agendadas from public, anon, authenticated;

-- quantos candidatos esperam resposta na vaga (a curtida pendente, sem aceite)
create or replace function privado.candidatos_esperando(p_anuncio uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.curtidas c
   where c.anuncio_id = p_anuncio and c.status = 'pendente' and c.aceita_em is null
$$;

-- a equipe agenda (de 1 a 168 horas; na tela, 3, 7 e 24); agendar de novo troca a hora
create or replace function public.agendar_remocao(p_anuncio uuid, p_horas integer, p_nota text, p_so_sem_resposta boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  nota text := nullif(btrim(regexp_replace(coalesce(p_nota, ''), '\s+', ' ', 'g')), '');
  v_titulo text;
  v_status text;
  v_quando timestamptz;
begin
  perform privado.exigir_equipe();
  if p_horas is null or p_horas < 1 or p_horas > 168 then
    raise exception 'Escolha de 1 a 168 horas.' using errcode = '22023';
  end if;
  if char_length(nota) > 500 then
    raise exception 'Use no máximo 500 letras no motivo.' using errcode = 'P0001';
  end if;
  select a.titulo, a.status into v_titulo, v_status from public.anuncios a where a.id = p_anuncio;
  if not found then
    raise exception 'Anúncio não encontrado.' using errcode = 'P0002';
  end if;
  if v_status = 'removido' then
    raise exception 'O anúncio já está removido.' using errcode = 'P0001';
  end if;
  v_quando := now() + make_interval(hours => p_horas);
  insert into privado.remocoes_agendadas (anuncio_id, remover_em, nota, so_sem_resposta, agendada_por)
  values (p_anuncio, v_quando, nota, coalesce(p_so_sem_resposta, true), (select auth.uid()))
  on conflict (anuncio_id) do update
     set remover_em = excluded.remover_em, nota = excluded.nota, so_sem_resposta = excluded.so_sem_resposta,
         agendada_por = excluded.agendada_por, situacao = 'agendada', criada_em = now(), resolvida_em = null;
  perform privado.registrar('agendar_remocao', 'anuncio', p_anuncio::text, v_titulo,
                            jsonb_build_object('horas', p_horas, 'nota', nota, 'so_sem_resposta', p_so_sem_resposta));
  return jsonb_build_object('remover_em', v_quando, 'esperando', privado.candidatos_esperando(p_anuncio));
end
$$;

create or replace function public.cancelar_remocao(p_anuncio uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe();
  update privado.remocoes_agendadas set situacao = 'cancelada', resolvida_em = now()
   where anuncio_id = p_anuncio and situacao = 'agendada';
  perform privado.registrar('cancelar_remocao', 'anuncio', p_anuncio::text, null, '{}'::jsonb);
end
$$;

-- a fila da moderação: as remoções agendadas (e as resolvidas nos últimos 7 dias) dos anúncios pedidos
create or replace function public.remocoes_agendadas(p_anuncios uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform privado.exigir_equipe();
  return coalesce((select jsonb_agg(jsonb_build_object(
            'anuncio_id', r.anuncio_id, 'remover_em', r.remover_em, 'situacao', r.situacao, 'nota', r.nota,
            'so_sem_resposta', r.so_sem_resposta, 'resolvida_em', r.resolvida_em,
            'esperando', privado.candidatos_esperando(r.anuncio_id)))
           from privado.remocoes_agendadas r
          where r.anuncio_id = any (p_anuncios)
            and (r.situacao = 'agendada' or r.resolvida_em > now() - interval '7 days')), '[]'::jsonb);
end
$$;

-- o robô das filas: as que venceram. Remove como o botão Remover (o aviso para quem publicou sai pelo mesmo caminho)
create or replace function public.servidor_remover_agendados(p_chave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_titulo text;
  anterior text := current_setting('publike.sistema', true);
  v_feitas integer := 0;
  v_respondeu integer := 0;
begin
  perform privado.exigir_servidor(p_chave);
  for r in select * from privado.remocoes_agendadas
            where situacao = 'agendada' and remover_em <= now()
            order by remover_em limit 20 for update skip locked loop
    if r.so_sem_resposta and privado.candidatos_esperando(r.anuncio_id) = 0 then
      update privado.remocoes_agendadas set situacao = 'respondeu', resolvida_em = now() where anuncio_id = r.anuncio_id;
      v_respondeu := v_respondeu + 1;
      continue;
    end if;
    select a.titulo into v_titulo from public.anuncios a where a.id = r.anuncio_id;
    perform set_config('publike.sistema', 'on', true);
    update public.anuncios set status = 'removido', nota_moderacao = r.nota
     where id = r.anuncio_id and status <> 'removido';
    update public.denuncias set status = 'procedente' where anuncio_id = r.anuncio_id and status = 'aberta';
    perform set_config('publike.sistema', coalesce(anterior, ''), true);
    update privado.remocoes_agendadas set situacao = 'feita', resolvida_em = now() where anuncio_id = r.anuncio_id;
    perform privado.registrar('remover_anuncio', 'anuncio', r.anuncio_id::text, v_titulo,
                              jsonb_build_object('nota', r.nota, 'agendada', true));
    v_feitas := v_feitas + 1;
  end loop;
  return jsonb_build_object('feitas', v_feitas, 'respondeu', v_respondeu);
end
$$;

revoke execute on function privado.candidatos_esperando(uuid) from public, anon, authenticated;
revoke execute on function public.agendar_remocao(uuid, integer, text, boolean), public.cancelar_remocao(uuid),
  public.remocoes_agendadas(uuid[]), public.servidor_remover_agendados(text) from public, anon;
grant execute on function public.agendar_remocao(uuid, integer, text, boolean), public.cancelar_remocao(uuid),
  public.remocoes_agendadas(uuid[]) to authenticated, service_role;
-- o robô usa a chave pública com a chave do servidor (como as outras funções do servidor)
grant execute on function public.servidor_remover_agendados(text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
