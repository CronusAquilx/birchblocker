import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export function useWatchHistory() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['watch_history', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', user!.id)
        .order('watched_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const record = useMutation({
    mutationFn: async (item: { tmdb_id: number; media_type: string; title?: string; poster_path?: string; season?: number; episode?: number; progress?: number }) => {
      const { error } = await supabase.from('watch_history').insert({
        user_id: user!.id,
        ...item,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watch_history'] }),
  });

  const clear = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('watch_history').delete().eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watch_history'] }),
  });

  return { ...query, record, clear };
}
