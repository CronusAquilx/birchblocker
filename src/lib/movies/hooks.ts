import { useQuery } from '@tanstack/react-query';
import { tmdb, MOCK_MOVIES, GENRES, type TMDBMovie, type TMDBDetail, type TMDBPerson } from './tmdb';

const API_KEY = (import.meta.env['VITE_TMDB_API_KEY'] || '0ea74aa80d71c4dc484c0a58f26ea7b8').trim();

function buildFallbackDetail(id: number, kind: 'movie' | 'tv'): TMDBDetail {
  const fallback = MOCK_MOVIES.find((m) => m.id === id);
  const base = {
    id,
    title: fallback?.title || (kind === 'movie' ? `Movie #${id}` : undefined),
    name: kind === 'tv' ? (fallback?.name || fallback?.title || `Show #${id}`) : fallback?.name,
    poster_path: fallback?.poster_path || null,
    backdrop_path: fallback?.backdrop_path || null,
    overview: fallback?.overview || 'Details are temporarily unavailable, but you can still try playback servers.',
    vote_average: fallback?.vote_average || 0,
    release_date: fallback?.release_date,
    first_air_date: fallback?.first_air_date,
    genre_ids: fallback?.genre_ids || [],
    media_type: kind,
    popularity: fallback?.popularity || 0,
    genres: (fallback?.genre_ids || []).map((gid) => ({ id: gid, name: GENRES[gid] || 'Unknown' })),
    credits: { cast: [], crew: [] },
    videos: { results: [] },
    similar: { results: MOCK_MOVIES.filter((m) => m.id !== id).slice(0, 8) },
    recommendations: { results: MOCK_MOVIES.filter((m) => m.id !== id).slice(0, 8) },
  } as TMDBDetail;

  if (kind === 'tv') {
    base.number_of_seasons = 1;
    base.seasons = [{ season_number: 1, name: 'Season 1', episode_count: 24, poster_path: base.poster_path }];
  } else {
    base.runtime = 120;
  }

  return base;
}

function useTMDBQuery(key: string[], fn: () => Promise<TMDBMovie[]>) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      try {
        const result = await fn();
        const playable = (result || []).filter((item) => {
          const mediaType = item.media_type;
          if (mediaType && mediaType !== 'movie' && mediaType !== 'tv') return false;
          return Boolean(item.id) && Boolean(item.title || item.name || item.poster_path || item.backdrop_path);
        });
        return playable.length > 0 ? playable : MOCK_MOVIES;
      } catch {
        return MOCK_MOVIES;
      }
    },
    enabled: true,
    staleTime: 1000 * 60 * 10,
    retry: 1,
    initialData: API_KEY ? undefined : MOCK_MOVIES,
  });
}

export const useTrending = () => useTMDBQuery(['trending'], () => tmdb.trending());
export const useTopRatedMovies = () => useTMDBQuery(['topRatedMovies'], () => tmdb.topRatedMovies());
export const useTopRatedTV = () => useTMDBQuery(['topRatedTV'], () => tmdb.topRatedTV());
export const useNowPlaying = () => useTMDBQuery(['nowPlaying'], () => tmdb.nowPlaying());
export const usePopular = () => useTMDBQuery(['popular'], () => tmdb.popular());
export const useAnime = () => useTMDBQuery(['anime'], () => tmdb.anime());
export const useBollywood = () => useTMDBQuery(['bollywood'], () => tmdb.bollywood());
export const useKDrama = () => useTMDBQuery(['kDrama'], () => tmdb.kDrama());
export const useHiddenGems = () => useTMDBQuery(['hiddenGems'], () => tmdb.hiddenGems());
export const useByDecade = (decade: number) => useTMDBQuery(['decade', String(decade)], () => tmdb.byDecade(decade));
export const useByGenre = (genreId: string) => useTMDBQuery(['genre', genreId], () => tmdb.byGenre(genreId));

export const useSearch = (query: string) =>
  useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      try {
        const result = await tmdb.search(query);
        return (result || []).filter((item) => {
          const mediaType = item.media_type;
          if (mediaType && mediaType !== 'movie' && mediaType !== 'tv') return false;
          return Boolean(item.poster_path) && Boolean(item.title || item.name);
        });
      } catch {
        return [];
      }
    },
    enabled: query.length > 1,
    staleTime: 1000 * 60 * 5,
  });

export const useMovieDetail = (id: number) =>
  useQuery({
    queryKey: ['movie', id],
    queryFn: async () => {
      try {
        return await tmdb.movieDetail(id);
      } catch {
        return buildFallbackDetail(id, 'movie');
      }
    },
    enabled: id > 0,
    staleTime: 1000 * 60 * 30,
  });

export const usePerson = (id: number) =>
  useQuery({
    queryKey: ['person', id],
    queryFn: async () => {
      try {
        return await tmdb.person(id);
      } catch {
        return null;
      }
    },
    enabled: id > 0,
    staleTime: 1000 * 60 * 30,
  });

export const useTVDetail = (id: number) =>
  useQuery({
    queryKey: ['tv', id],
    queryFn: async () => {
      try {
        return await tmdb.tvDetail(id);
      } catch {
        return buildFallbackDetail(id, 'tv');
      }
    },
    enabled: id > 0,
    staleTime: 1000 * 60 * 30,
  });
