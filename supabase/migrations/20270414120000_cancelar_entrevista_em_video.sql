-- Cancelar o pedido de entrevista em vídeo (10/11/2026). Rode depois de 20270413120000_vinte_vagas_gratis_e_plano_acima.sql.
-- Pode rodar de novo.
--
-- Quem contrata cancela um pedido que ainda não foi enviado (pedida ou respondendo): o pedido sai da página do
-- candidato, as respostas gravadas até ali são apagadas e o candidato recebe o aviso. Cancelado, dá para pedir de
-- novo (antes, só o vencido podia ser pedido de novo, e o segundo pedido não fazia nada).

-- 1. A situação nova
alter table public.entrevistas_video drop constraint if exists entrevistas_video_situacao_check;
alter table public.entrevistas_video add constraint entrevistas_video_situacao_check
  check (situacao in ('pedida', 'respondendo', 'enviada', 'vencida', 'apagada', 'cancelada'));

-- 2. Pedir de novo também o cancelado
do $$
declare
  def text := pg_get_functiondef('privado.video_pedir_um(uuid,uuid,uuid)'::regprocedure);
begin
  if position($a$not in ('vencida', 'cancelada')$a$ in def) = 0 then
    if position($a$v_atual <> 'vencida'$a$ in def) = 0 then
      raise exception 'Não achei o trecho a trocar em privado.video_pedir_um.';
    end if;
    execute replace(def, $a$v_atual <> 'vencida'$a$, $a$v_atual not in ('vencida', 'cancelada')$a$);
  end if;
end
$$;

-- 3. Cancelar: só quem publicou a vaga, e só o que ainda não foi enviado. Devolve os arquivos gravados até ali
-- (o servidor apaga do Storage).
create or replace function public.video_cancelar(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.entrevistas_video;
  a public.anuncios;
  v_caminhos text[];
  v_quem text;
begin
  perform privado.exigir_conta_ativa();
  select * into e from public.entrevistas_video x where x.id = p_id;
  if e.id is null then
    raise exception 'Entrevista não encontrada.' using errcode = '42501';
  end if;
  a := privado.minha_vaga_para_video(e.anuncio_id);
  if e.situacao not in ('pedida', 'respondendo') then
    raise exception 'Só dá para cancelar o pedido que ainda não foi respondido.' using errcode = 'P0001';
  end if;
  v_caminhos := array(select r.caminho from public.entrevistas_video_respostas r
                       where r.entrevista_id = e.id and r.caminho is not null);
  delete from public.entrevistas_video_respostas where entrevista_id = e.id;
  update public.entrevistas_video set situacao = 'cancelada', lembrado_em = null where id = e.id;
  select p.nome into v_quem from public.perfis p where p.id = a.autor_id;
  insert into public.notificacoes (destinatario_id, tipo, anuncio_id, ator_id, texto)
  values (e.perfil_id, 'video_pedido', a.id, a.autor_id,
          left(coalesce(v_quem, 'A empresa') || ' cancelou o pedido de entrevista em vídeo para a vaga “' || a.titulo
               || '”. Não precisa gravar.', 300));
  return v_caminhos;
end
$$;
revoke execute on function public.video_cancelar(uuid) from public, anon;
grant execute on function public.video_cancelar(uuid) to authenticated;

-- 4. O candidato não vê mais o pedido cancelado (a página diz que não há entrevista)
do $$
declare
  def text := pg_get_functiondef('public.video_minha(uuid)'::regprocedure);
  antes constant text := $a$where x.anuncio_id = p_anuncio and x.perfil_id = (select auth.uid());$a$;
  depois constant text := $a$where x.anuncio_id = p_anuncio and x.perfil_id = (select auth.uid())
     and x.situacao <> 'cancelada';$a$;
begin
  if position($a$x.situacao <> 'cancelada'$a$ in def) = 0 then
    if position(antes in def) = 0 then
      raise exception 'Não achei o trecho a trocar em public.video_minha.';
    end if;
    execute replace(def, antes, depois);
  end if;
end
$$;

notify pgrst, 'reload schema';
