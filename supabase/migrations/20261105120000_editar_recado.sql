-- Editar o próprio recado (05/11/2026). Pode rodar de novo.
--
--   Quem escreveu troca o texto (a foto e a citação ficam como estão). O texto novo passa pelas
--   mesmas regras do recado novo (até 280 letras, sem telefone, e-mail ou link) e, com a moderação
--   pela IA ligada, volta para a revisão antes de aparecer para os outros. O recado retido volta
--   sempre para a revisão (corrigir não pula a moderação). Até 10 edições por dia.
--
-- Rode depois de 20261104120000_falhas_cadastro.sql.

alter table public.recados add column if not exists editado_em timestamptz;

alter table privado.limites_uso drop constraint if exists limites_uso_acao_check;
alter table privado.limites_uso add constraint limites_uso_acao_check check (acao = any (array[
  'anuncio', 'curtida', 'denuncia', 'ia_texto', 'edicao', 'avaliacao', 'desfazer_match', 'ia_indicacao',
  'mensagem', 'seguir', 'recomendacao', 'etapa', 'contratacao', 'ia_resumo', 'convite', 'talento',
  'convite_candidato', 'convite_equipe', 'conexao', 'recado', 'recado_edicao']));

create or replace function public.editar_recado(p_recado uuid, p_texto text)
returns table (status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  conta uuid := (select public.conta_atual());
  v_texto text := btrim(regexp_replace(coalesce(p_texto, ''), '\n{3,}', E'\n\n', 'g'));
  v_antes text;
  v_status_antes text;
  v_status text;
begin
  if conta is null then
    raise exception 'Entre na sua conta para editar o recado.' using errcode = '42501';
  end if;
  perform privado.exigir_conta_ativa();
  select r.texto, r.status into v_antes, v_status_antes
    from public.recados r
   where r.id = p_recado and r.autor_id = conta and r.status <> 'apagado'
   for update;
  if not found then
    raise exception 'Recado não encontrado.' using errcode = 'P0002';
  end if;
  if char_length(v_texto) < 1 then
    raise exception 'Escreva o recado.' using errcode = 'P0001', hint = 'texto';
  end if;
  if char_length(v_texto) > 280 then
    raise exception 'O recado passa de 280 letras.' using errcode = 'P0001', hint = 'texto';
  end if;
  if public.tem_contato(v_texto, true) then
    raise exception 'Tire o telefone, o e-mail ou o link do recado. O contato é pela conversa do Publike.'
      using errcode = 'P0001', hint = 'contato';
  end if;
  -- o mesmo texto: nada muda
  if v_texto = v_antes then
    return query select v_status_antes;
    return;
  end if;
  perform privado.conferir_limite('recado_edicao', 10,
    'Você já editou recados 10 vezes hoje. Tente de novo amanhã.');

  v_status := case
                when v_status_antes = 'retido'
                  or coalesce((select c.ia_moderacao from public.config_site c limit 1), false)
                  then 'revisao'
                else 'no_ar'
              end;
  update public.recados r
     set texto = v_texto,
         status = v_status,
         motivo = null,
         editado_em = now(),
         -- publicado pela primeira vez agora (estava em revisão e a revisão está desligada)
         publicado_em = coalesce(r.publicado_em, case when v_status = 'no_ar' then now() end)
   where r.id = p_recado;
  if v_status = 'revisao' then
    insert into privado.fila_ia_recados (recado_id) values (p_recado)
    on conflict (recado_id) do update
      set status = 'pendente', tentativas = 0, criado_em = now(), tentar_depois = now();
  end if;
  return query select v_status;
end
$$;

revoke execute on function public.editar_recado(uuid, text) from public, anon;
grant execute on function public.editar_recado(uuid, text) to authenticated;

notify pgrst, 'reload schema';
