-- Admin › E-mails › Enviados: o "Etapa atualizada" mostra qual etapa e de qual vaga (09/11/2026). Pode rodar de novo.
--
-- A etapa sai do texto do aviso que foi no e-mail ("“Atendente” agora está em: Entrevista."); o processo encerrado
-- aparece como "Não seguiu".

drop function if exists public.admin_emails_enviados(text, text, text, integer);
create or replace function public.admin_emails_enviados(p_modelo text default null, p_status text default null,
                                                       p_busca text default null, p_limite integer default 100)
returns table (
  id bigint,
  modelo text,
  para text,
  usuario_id uuid,
  nome text,
  status text,
  tentativas smallint,
  erro text,
  criado_em timestamptz,
  enviado_em timestamptz,
  -- o "Etapa atualizada": a vaga e a etapa ("Entrevista", "Contratado", "Não seguiu"...)
  vaga text,
  etapa text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_busca text := nullif(btrim(coalesce(p_busca, '')), '');
  v_padrao text;
begin
  perform privado.exigir_admin();
  if v_busca is not null then
    v_padrao := '%' || replace(replace(replace(left(v_busca, 120), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  return query
  select f.id, f.modelo, f.para, f.usuario_id, p.nome, f.status, f.tentativas, f.erro, f.criado_em, f.enviado_em,
         nullif(f.dados ->> 'titulo', ''),
         case when f.modelo = 'etapa' then
           coalesce(substring(f.dados ->> 'motivo' from 'agora está em: ([^.]+)'),
                    case when f.dados ->> 'motivo' ilike '%foi encerrado%' then 'Não seguiu' end)
         end
    from privado.fila_emails f
    left join public.perfis p on p.id = f.usuario_id
   where (p_modelo is null or f.modelo = p_modelo)
     and (p_status is null
          or (p_status = 'fila' and f.status in ('pendente', 'enviando'))
          or (p_status <> 'fila' and f.status = p_status))
     and (v_padrao is null or f.para ilike v_padrao or p.nome ilike v_padrao)
   order by f.id desc
   limit least(greatest(coalesce(p_limite, 100), 1), 300);
end
$$;
revoke execute on function public.admin_emails_enviados(text, text, text, integer), public.admin_reenviar_email(bigint)
  from public, anon, authenticated;
grant execute on function public.admin_emails_enviados(text, text, text, integer), public.admin_reenviar_email(bigint)
  to service_role;


notify pgrst, 'reload schema';
