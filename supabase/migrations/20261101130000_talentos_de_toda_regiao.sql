-- Painel › Talentos: todos os talentos, não só os da cidade da vaga (01/11/2026). Pode rodar de novo.
-- Quem mais combina com a vaga vem primeiro (a conta do % é no site; a cidade e o bairro entram nela).
-- E a conta pela qual se age (public.conta_atual()): a equipe da agência também vê os talentos das
-- vagas da agência. O resto igual a 20261019240000_curriculo_estudos.

create or replace function public.talentos_para_vaga(p_anuncio uuid)
returns table (
  perfil_id uuid,
  nome text,
  foto text,
  cidade text,
  bairro text,
  escolaridade text,
  curso text,
  experiencias jsonb,
  cursos text[],
  cnh text,
  disponibilidade text[],
  atualizado_em timestamptz,
  convidado boolean,
  titulo text,
  habilidades text[],
  estudos jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  eu uuid := public.conta_atual();
begin
  perform privado.exigir_conta_ativa();
  if not exists (
    select 1 from public.anuncios a where a.id = p_anuncio and a.autor_id = eu and a.tipo = 'vaga'
  ) then
    raise exception 'Vaga não encontrada.' using errcode = 'P0002';
  end if;
  return query
  select p.id,
         -- "Maria S.": o nome inteiro só aparece se a pessoa curtir a vaga
         privado.nome_curto(p.nome),
         p.foto, p.cidade, p.bairro,
         c.escolaridade, c.curso, c.experiencias, c.cursos, c.cnh, c.disponibilidade, c.atualizado_em,
         exists (select 1 from public.convites_vaga cv where cv.anuncio_id = p_anuncio and cv.perfil_id = p.id),
         c.titulo, c.habilidades, c.estudos
    from public.curriculo_visivel v
    join public.curriculos c on c.perfil_id = v.perfil_id
    join public.perfis p on p.id = v.perfil_id
   where p.id <> eu
     and p.tipo = 'pessoa'
     and (p.suspenso_ate is null or p.suspenso_ate < now())
     and not exists (select 1 from public.curtidas k where k.anuncio_id = p_anuncio and k.perfil_id = p.id)
     and not privado.ha_bloqueio(eu, p.id)
   order by c.atualizado_em desc
   limit 500;
end
$$;
revoke execute on function public.talentos_para_vaga(uuid) from public, anon;
grant execute on function public.talentos_para_vaga(uuid) to authenticated;

notify pgrst, 'reload schema';
