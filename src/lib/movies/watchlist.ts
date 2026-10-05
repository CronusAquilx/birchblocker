import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export function useWatchlist() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['watchlist', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user!.id)
        .order('added_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const add = useMutation({
    mutationFn: async (item: { tmdb_id: number; media_type: string; title?: string; poster_path?: string }) => {
      const { error } = await supabase.from('watchlist').upsert({
        user_id: user!.id,
        ...item,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  });

  const remove = useMutation({
    mutationFn: async ({ tmdb_id, media_type }: { tmdb_id: number; media_type: string }) => {
      const { error } = await supabase.from('watchlist')
        .delete()
        .eq('user_id', user!.id)
        .eq('tmdb_id', tmdb_id)
        .eq('media_type', media_type);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  });

  const isInWatchlist = (tmdb_id: number, media_type: string) =>
    query.data?.some((w) => w.tmdb_id === tmdb_id && w.media_type === media_type) ?? false;

  return { ...query, add, remove, isInWatchlist };
}
