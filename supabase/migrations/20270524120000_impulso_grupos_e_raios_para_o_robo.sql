-- O robô chama as funções do servidor com a chave pública (anon) e a chave do servidor (`privado.exigir_servidor`),
-- como as outras do impulso. As dos grupos (20270522120000) e dos raios (20270523120000) só tinham sido liberadas para
-- authenticated e service_role: o robô recebia "permission denied" e só o primeiro grupo saiu (pelo Admin). 14/11/2026.
-- Pode rodar de novo.

grant execute on function public.servidor_grupos_da_geral(text), public.servidor_grupo_da_geral(text, jsonb),
  public.servidor_grupos_feita(text, text) to anon;
grant execute on function public.servidor_raios_da_geral(text), public.servidor_raio_da_geral(text, jsonb),
  public.servidor_raios_feita(text, text, boolean) to anon;

notify pgrst, 'reload schema';
