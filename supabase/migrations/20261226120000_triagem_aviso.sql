-- Triagem com IA, item 5 (claude/plano-triagem-automatica.md, 30/10/2026): o candidato fica sabendo, na página da
-- vaga, que a empresa usa a Triagem com IA. Diz só se a vaga usa: no ar, de conta com o recurso liberado e com a
-- leitura dos candidatos ligada (na vaga ou, sem linha da vaga, no padrão da conta). Pode rodar de novo.

create or replace function public.vaga_usa_triagem(p_anuncio uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.anuncios a
      join privado.copiloto_contas c on c.conta_id = a.autor_id
      left join privado.copiloto_vagas v on v.anuncio_id = a.id
     where a.id = p_anuncio and a.tipo = 'vaga' and a.status = 'ativo'
       and privado.copiloto_liberado(a.autor_id)
       and coalesce(v.triagem, c.triagem, true))
$$;

revoke execute on function public.vaga_usa_triagem(uuid) from public;
grant execute on function public.vaga_usa_triagem(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
