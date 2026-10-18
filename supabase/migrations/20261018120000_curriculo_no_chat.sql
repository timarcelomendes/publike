-- Currículo pelo chat: na conversa de um match de vaga, quem curtiu anexa o PDF do currículo.
-- A mensagem leva o arquivo (quem publicou abre por um link que vale pouco tempo) e o PDF
-- fica guardado como o currículo da pessoa (vale para as próximas vagas).

alter table public.mensagens
  add column if not exists anexo text check (anexo ~ '^[0-9a-f-]{36}/[0-9]{10,20}\.pdf$'),
  add column if not exists anexo_nome text check (char_length(anexo_nome) between 1 and 120);

create or replace function public.enviar_curriculo_na_conversa(p_anuncio uuid, p_arquivo text, p_nome text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  eu uuid := (select auth.uid());
  v_nome text := left(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), 120);
  v_id bigint;
begin
  if eu is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  -- o PDF já foi para a pasta da própria pessoa no Storage
  if p_arquivo is null or p_arquivo !~ ('^' || eu::text || '/[0-9]{10,20}\.pdf$') then
    raise exception 'Envie o PDF de novo.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.anuncios a where a.id = p_anuncio and a.tipo = 'vaga') then
    raise exception 'O currículo vai só nas conversas de vaga.' using errcode = '22023';
  end if;
  if v_nome = '' then
    v_nome := 'Currículo.pdf';
  end if;
  -- a mensagem, com as regras e o aviso de uma mensagem comum; a conversa é a da curtida
  -- de quem anexa (quem publicou não tem currículo a mandar)
  v_id := public.enviar_mensagem(p_anuncio, eu, 'Mandei meu currículo: ' || v_nome);
  update public.mensagens set anexo = p_arquivo, anexo_nome = v_nome where id = v_id;
  -- e fica guardado como o currículo da pessoa
  insert into public.curriculos (perfil_id, arquivo)
  values (eu, p_arquivo)
  on conflict (perfil_id) do update set arquivo = excluded.arquivo, atualizado_em = now();
  return v_id;
end
$$;
revoke execute on function public.enviar_curriculo_na_conversa(uuid, text, text) from public, anon;
grant execute on function public.enviar_curriculo_na_conversa(uuid, text, text) to authenticated;
