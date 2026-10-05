// All movie traffic (TMDB data, images, embed players) goes through Astra's
// own relay at /api/movies, so the browser only talks to Astra's domain.
const RELAY = '/api/movies';

/** Access token for relay auth, read straight from the stored session. */
export const relayToken = (): string => {
  try {
    const raw = localStorage.getItem(`sb-${import.meta.env['VITE_SUPABASE_PROJECT_ID']}-auth-token`);
    return raw ? (JSON.parse(raw)?.access_token ?? '') : '';
  } catch {
    return '';
  }
};

export const img = (path: string | null, size = 'w500') =>
  path ? `${RELAY}?img=${encodeURIComponent(`/${size}${path}`)}&token=${encodeURIComponent(relayToken())}` : '/placeholder.svg';

export const backdrop = (path: string | null) =>
  path ? `${RELAY}?img=${encodeURIComponent(`/original${path}`)}&token=${encodeURIComponent(relayToken())}` : '/placeholder.svg';

/** Route a streaming-source embed page through the relay. */
export const proxiedEmbed = (url: string) =>
  `${RELAY}?embed=${encodeURIComponent(url)}&token=${encodeURIComponent(relayToken())}`;

export interface TMDBMovie {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids: number[];
  media_type?: string;
  popularity: number;
  original_language?: string;
  adult?: boolean;
}

export interface TMDBDetail extends TMDBMovie {
  tagline?: string;
  runtime?: number;
  number_of_seasons?: number;
  seasons?: { season_number: number; name: string; episode_count: number; poster_path: string | null }[];
  genres?: { id: number; name: string }[];
  budget?: number;
  revenue?: number;
  status?: string;
  production_companies?: { id: number; name: string; logo_path: string | null }[];
  credits?: {
    cast: { id: number; name: string; character: string; profile_path: string | null }[];
    crew: { id: number; name: string; job: string; profile_path: string | null }[];
  };
  videos?: { results: { key: string; type: string; site: string }[] };
  similar?: { results: TMDBMovie[] };
  recommendations?: { results: TMDBMovie[] };
}

export interface TMDBPerson {
  id: number;
  name: string;
  biography?: string;
  birthday?: string | null;
  place_of_birth?: string | null;
  profile_path: string | null;
  known_for_department?: string;
  combined_credits?: { cast: TMDBMovie[]; crew: TMDBMovie[] };
}

async function fetchTMDB<T>(endpoint: string, params: Record<string, string> = {}): Promise<T> {
  const query = new URLSearchParams({ tmdb: endpoint, ...params });
  const res = await fetch(`${RELAY}?${query}`, {
    headers: { Authorization: `Bearer ${relayToken()}` },
  });
  if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
  return res.json();
}

export const tmdb = {
  trending: (type = 'all', window = 'week') =>
    fetchTMDB<{ results: TMDBMovie[] }>(`/trending/${type}/${window}`).then(r => r.results),

  topRatedMovies: (page = '1') =>
    fetchTMDB<{ results: TMDBMovie[] }>('/movie/top_rated', { page }).then(r => r.results),

  topRatedTV: (page = '1') =>
    fetchTMDB<{ results: TMDBMovie[] }>('/tv/top_rated', { page }).then(r => r.results),

  nowPlaying: () =>
    fetchTMDB<{ results: TMDBMovie[] }>('/movie/now_playing').then(r => r.results),

  popular: () =>
    fetchTMDB<{ results: TMDBMovie[] }>('/movie/popular').then(r => r.results),

  discover: (params: Record<string, string>) =>
    fetchTMDB<{ results: TMDBMovie[] }>('/discover/movie', params).then(r => r.results),

  discoverTV: (params: Record<string, string>) =>
    fetchTMDB<{ results: TMDBMovie[] }>('/discover/tv', params).then(r => r.results),

  movieDetail: (id: number) =>
    fetchTMDB<TMDBDetail>(`/movie/${id}`, { append_to_response: 'credits,videos,similar,recommendations' }),

  tvDetail: (id: number) =>
    fetchTMDB<TMDBDetail>(`/tv/${id}`, { append_to_response: 'credits,videos,similar,recommendations' }),

  person: (id: number) =>
    fetchTMDB<TMDBPerson>(`/person/${id}`, { append_to_response: 'combined_credits' }),

  search: (query: string, page = '1') =>
    fetchTMDB<{ results: TMDBMovie[] }>('/search/multi', { query, page }).then(r => r.results),

  anime: () =>
    tmdb.discoverTV({ with_genres: '16', with_original_language: 'ja', sort_by: 'popularity.desc' }),

  bollywood: () =>
    tmdb.discover({ region: 'IN', with_original_language: 'hi', sort_by: 'popularity.desc' }),

  kDrama: () =>
    tmdb.discoverTV({ with_origin_country: 'KR', sort_by: 'popularity.desc' }),

  hiddenGems: () =>
    tmdb.discover({ sort_by: 'vote_average.desc', 'vote_count.gte': '100', 'popularity.lte': '50' }),

  byDecade: (start: number) =>
    tmdb.discover({
      'primary_release_date.gte': `${start}-01-01`,
      'primary_release_date.lte': `${start + 9}-12-31`,
      sort_by: 'vote_average.desc',
      'vote_count.gte': '200',
    }),

  byGenre: (genreId: string) =>
    tmdb.discover({ with_genres: genreId, sort_by: 'popularity.desc' }),
};

export type ServerCategory = 'new' | '4k' | 'fast' | 'multi' | 'backup';

export const SERVER_CATEGORIES: { id: ServerCategory; name: string; description: string }[] = [
  { id: 'new', name: '🔥 New Releases', description: 'Best for early releases & latest movies' },
  { id: '4k', name: '💎 4K / HD', description: 'High quality streams' },
  { id: 'fast', name: '⚡ Fast', description: 'Quick load, low buffering' },
  { id: 'multi', name: '🎯 Multi-Source', description: 'Auto-failover providers' },
];

type StreamingServer = {
  id: string;
  name: string;
  category: ServerCategory;
  url: (id: number, type?: string, s?: number, e?: number) => string;
};

export const STREAMING_SERVERS: StreamingServer[] = [
  // 🔥 NEW RELEASES — best for early releases / latest movies
  { id: 'vidlink', name: 'VidLink Pro', category: 'new', url: (id, type = 'movie', s, e) => type === 'tv' && s && e ? `https://vidlink.pro/tv/${id}/${s}/${e}` : `https://vidlink.pro/${type}/${id}` },
  { id: 'embedapi', name: 'Embed-API', category: 'new', url: (id, type = 'movie', s, e) => type === 'tv' && s && e ? `https://embed-api.stream/embed/tv/${id}/${s}/${e}` : `https://embed-api.stream/embed/${type}/${id}` },
  { id: 'vidzee', name: 'VidZee', category: 'new', url: (id, type = 'movie', s, e) => type === 'tv' && s && e ? `https://player.vidzee.wtf/embed/tv/${id}/${s}/${e}` : `https://player.vidzee.wtf/embed/${type}/${id}` },

  // 💎 4K / HD
  { id: 'cinesrc', name: 'CineSrc HD', category: '4k', url: (id, type = 'movie', s, e) => type === 'tv' && s && e ? `https://cinesrc.st/embed/tv/${id}/${s}/${e}` : `https://cinesrc.st/embed/${type}/${id}` },

  // ⚡ FAST
  { id: 'autoembed', name: 'AutoEmbed', category: 'fast', url: (id, type = 'movie', s, e) => type === 'tv' && s && e ? `https://autoembed.co/tv/tmdb/${id}-${s}-${e}` : `https://autoembed.co/${type}/tmdb/${id}` },
  { id: 'apiplayer', name: 'APIPlayer', category: 'fast', url: (id, type = 'movie', s, e) => type === 'tv' && s && e ? `https://apiplayer.ru/embed/tv/${id}/${s}/${e}` : `https://apiplayer.ru/embed/${type}/${id}` },

  // 🎯 MULTI-SOURCE / FAILOVER
  { id: 'superembed', name: 'SuperEmbed', category: 'multi', url: (id, _type, s, e) => s && e ? `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}` : `https://multiembed.mov/?video_id=${id}&tmdb=1` },
  { id: 'twoembed', name: '2Embed', category: 'multi', url: (id, type = 'movie', s, e) => type === 'tv' && s && e ? `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}` : `https://www.2embed.cc/embed/${id}` },

  // 🛡️ BACKUP (legacy / reliable)

  // 🔥 EXTRA NEW RELEASES (added — best for brand-new movies like Tuner, etc.)
  { id: 'vidsrcsu', name: 'VidSrc.su', category: 'new', url: (id, type = 'movie', s, e) => type === 'tv' && s && e ? `https://vidsrc.su/embed/tv/${id}/${s}/${e}` : `https://vidsrc.su/embed/${type}/${id}` },
  { id: 'vidfast', name: 'VidFast', category: 'new', url: (id, type = 'movie', s, e) => type === 'tv' && s && e ? `https://vidfast.pro/tv/${id}/${s}/${e}?autoPlay=true` : `https://vidfast.pro/movie/${id}?autoPlay=true` },

  // 💎 EXTRA 4K / HD

  // ⚡ EXTRA FAST

  // 🛡️ EXTRA BACKUP
];


export const DOWNLOAD_PROVIDERS = [
  { id: 'rgshows', name: 'RGShows', url: (id: number, type: string, s?: number, e?: number) => type === 'tv' && s && e ? `https://db.rgshows.me/tv/${id}/${s}/${e}` : `https://db.rgshows.me/${type}/${id}` },
  { id: 'dl-vidsrc', name: 'VidSrc DL', url: (id: number, type: string, s?: number, e?: number) => type === 'tv' && s && e ? `https://dl.vidsrc.vip/tv/${id}/${s}/${e}` : `https://dl.vidsrc.vip/${type}/${id}` },
  { id: 'dl-embedsu', name: 'EmbedSu DL', url: (id: number, type: string, s?: number, e?: number) => type === 'tv' && s && e ? `https://dl.embed.su/tv/${id}/${s}/${e}` : `https://dl.embed.su/${type}/${id}` },
  { id: 'fmovies', name: 'FMovies', url: (id: number, type: string, s?: number, e?: number) => type === 'tv' && s && e ? `https://fmovies.ps/tv/${id}/${s}/${e}` : `https://fmovies.ps/${type}/${id}` },
  { id: 'dl-autoembed', name: 'AutoEmbed DL', url: (id: number, type: string, s?: number, e?: number) => type === 'tv' && s && e ? `https://autoembed.co/download/tv/tmdb/${id}-${s}-${e}` : `https://autoembed.co/download/${type}/tmdb/${id}` },
  { id: 'dl-moviesapi', name: 'MoviesAPI DL', url: (id: number, type: string, s?: number, e?: number) => type === 'tv' && s && e ? `https://moviesapi.club/tv/${id}-${s}-${e}` : `https://moviesapi.club/${type}/${id}` },
] as const;

export const GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi',
  10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

export const GENRE_LIST = Object.entries(GENRES).map(([id, name]) => ({ id, name }));


export const FREE_SOURCES = [
  { id: 'youtube', name: 'YouTube Movies' },
  { id: 'archive', name: 'Classic & Free' },
  { id: 'pluto', name: 'Pluto TV Live' },
  { id: 'tubi', name: 'Tubi Free Movies' },
] as const;

// Helper to get YouTube thumbnail
const ytThumb = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;

// Curated YouTube free movie IDs — real public-domain / free full movies on YouTube
export const YOUTUBE_MOVIES = [
  { id: 'yt_1', title: 'Night of the Living Dead', year: '1968', videoId: 'ubFq-wV3Eic', poster: ytThumb('ubFq-wV3Eic') },
  { id: 'yt_2', title: 'Nosferatu', year: '1922', videoId: 'dCkHJJqUIDY', poster: ytThumb('dCkHJJqUIDY') },
  { id: 'yt_3', title: 'The Cabinet of Dr. Caligari', year: '1920', videoId: 'xJGMOoU_JB4', poster: ytThumb('xJGMOoU_JB4') },
  { id: 'yt_4', title: 'Metropolis', year: '1927', videoId: 'CDaVDecYpCo', poster: ytThumb('CDaVDecYpCo') },
  { id: 'yt_5', title: 'His Girl Friday', year: '1940', videoId: 'rPLb6P54x4U', poster: ytThumb('rPLb6P54x4U') },
  { id: 'yt_6', title: 'Charade', year: '1963', videoId: 'qloBhfNPf9U', poster: ytThumb('qloBhfNPf9U') },
  { id: 'yt_7', title: 'The General', year: '1926', videoId: 'is5aE8GZknU', poster: ytThumb('is5aE8GZknU') },
  { id: 'yt_8', title: 'Detour', year: '1945', videoId: 'RdEeMOJMxnU', poster: ytThumb('RdEeMOJMxnU') },
  { id: 'yt_9', title: 'The Phantom of the Opera', year: '1925', videoId: 'kCKiR5P4j5w', poster: ytThumb('kCKiR5P4j5w') },
  { id: 'yt_10', title: 'Suddenly', year: '1954', videoId: 'PrmGS35Gikc', poster: ytThumb('PrmGS35Gikc') },
  { id: 'yt_11', title: 'The Strange Love of Martha Ivers', year: '1946', videoId: 'vUFnCtQjvGk', poster: ytThumb('vUFnCtQjvGk') },
  { id: 'yt_12', title: 'Scarlet Street', year: '1945', videoId: 'M-D5P6gbiPQ', poster: ytThumb('M-D5P6gbiPQ') },
  { id: 'yt_13', title: 'A Bucket of Blood', year: '1959', videoId: 'LOUCLpzB1gM', poster: ytThumb('LOUCLpzB1gM') },
  { id: 'yt_14', title: 'The Last Man on Earth', year: '1964', videoId: 'jnWFOQv3pAs', poster: ytThumb('jnWFOQv3pAs') },
  { id: 'yt_15', title: 'House on Haunted Hill', year: '1959', videoId: 'j9GqrqGBGp4', poster: ytThumb('j9GqrqGBGp4') },
  { id: 'yt_16', title: 'Dementia 13', year: '1963', videoId: 'HbD5N2MmGRM', poster: ytThumb('HbD5N2MmGRM') },
  { id: 'yt_17', title: 'The Terror', year: '1963', videoId: 'FxVFrWHKMxE', poster: ytThumb('FxVFrWHKMxE') },
  { id: 'yt_18', title: 'Voyage to the Planet of Prehistoric Women', year: '1968', videoId: 'JGFxM3LFwsA', poster: ytThumb('JGFxM3LFwsA') },
  { id: 'yt_19', title: 'Reefer Madness', year: '1936', videoId: 'zhQlcMHhQNM', poster: ytThumb('zhQlcMHhQNM') },
  { id: 'yt_20', title: 'The Brain That Wouldn\'t Die', year: '1962', videoId: 'FLkj2EeBsjE', poster: ytThumb('FLkj2EeBsjE') },
  { id: 'yt_21', title: 'Carnival of Souls', year: '1962', videoId: 'h-mSH0bOqJo', poster: ytThumb('h-mSH0bOqJo') },
  { id: 'yt_22', title: 'The Hitch-Hiker', year: '1953', videoId: 'cqTPlb0dpoU', poster: ytThumb('cqTPlb0dpoU') },
  { id: 'yt_23', title: 'Kansas City Confidential', year: '1952', videoId: 'E4ajriIsCUU', poster: ytThumb('E4ajriIsCUU') },
  { id: 'yt_24', title: 'The Stranger', year: '1946', videoId: 'mmv2CLTGP1Q', poster: ytThumb('mmv2CLTGP1Q') },
  { id: 'yt_25', title: 'My Man Godfrey', year: '1936', videoId: 'kQzELqvx6es', poster: ytThumb('kQzELqvx6es') },
  { id: 'yt_26', title: 'Anger Management', year: '2003', videoId: 'BSDg2oSn4Aw', poster: ytThumb('BSDg2oSn4Aw') },
  { id: 'yt_27', title: 'McLintock!', year: '1963', videoId: 'NLNh_cG8YhQ', poster: ytThumb('NLNh_cG8YhQ') },
  { id: 'yt_28', title: 'Caught in the Draft', year: '1941', videoId: 'G3sN8JJ7XME', poster: ytThumb('G3sN8JJ7XME') },
  { id: 'yt_29', title: 'Cyborg 2087', year: '1966', videoId: 'nMaO-xWT9ZI', poster: ytThumb('nMaO-xWT9ZI') },
  { id: 'yt_30', title: 'Attack of the 50 Foot Woman', year: '1958', videoId: 'ggpRTACIFt4', poster: ytThumb('ggpRTACIFt4') },
];

export const ARCHIVE_MOVIES = [
  { id: 'ar_1', title: 'D.O.A.', year: '1950', identifier: 'DOA1950', poster: 'https://archive.org/services/img/DOA1950' },
  { id: 'ar_2', title: 'The Little Shop of Horrors', year: '1960', identifier: 'TheLittleShopOfHorrors', poster: 'https://archive.org/services/img/TheLittleShopOfHorrors' },
  { id: 'ar_3', title: 'Plan 9 from Outer Space', year: '1959', identifier: 'Plan_9_from_Outer_Space_1959', poster: 'https://archive.org/services/img/Plan_9_from_Outer_Space_1959' },
  { id: 'ar_4', title: 'Carnival of Souls', year: '1962', identifier: 'CarnivalOfSouls', poster: 'https://archive.org/services/img/CarnivalOfSouls' },
  { id: 'ar_5', title: 'Voyage to the Bottom of the Sea', year: '1961', identifier: 'voyage_to_the_bottom_of_the_sea', poster: 'https://archive.org/services/img/voyage_to_the_bottom_of_the_sea' },
  { id: 'ar_6', title: 'The Iron Mask', year: '1929', identifier: 'the_iron_mask', poster: 'https://archive.org/services/img/the_iron_mask' },
  { id: 'ar_7', title: 'Gulliver\'s Travels', year: '1939', identifier: 'GulliversTravels1939', poster: 'https://archive.org/services/img/GulliversTravels1939' },
  { id: 'ar_8', title: 'The Phantom of the Opera', year: '1925', identifier: 'phantom_of_the_opera', poster: 'https://archive.org/services/img/phantom_of_the_opera' },
];

export const MOCK_MOVIES: TMDBMovie[] = [
  { id: 550, title: 'Fight Club', poster_path: '/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg', backdrop_path: '/hZkgoQYus5dXo3H8T7Uef6DNknx.jpg', overview: 'A ticking-Loss explosion of nonconformity.', vote_average: 8.4, release_date: '1999-10-15', genre_ids: [18], popularity: 90, media_type: 'movie' },
  { id: 680, title: 'Pulp Fiction', poster_path: '/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg', backdrop_path: '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg', overview: 'A burger-loving hitman and philosophical musings.', vote_average: 8.5, release_date: '1994-09-10', genre_ids: [53, 80], popularity: 100, media_type: 'movie' },
  { id: 278, title: 'The Shawshank Redemption', poster_path: '/9cjIGRQL6hsSVv0pMiTAfmtMOWg.jpg', backdrop_path: '/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg', overview: 'Hope is a good thing.', vote_average: 8.7, release_date: '1994-09-23', genre_ids: [18, 80], popularity: 95, media_type: 'movie' },
  { id: 155, title: 'The Dark Knight', poster_path: '/qJ2tW6WMUDux911BTUb8SWCUt0R.jpg', backdrop_path: '/nMKdUUepR0i5zn0y1T4CsSB5ez.jpg', overview: 'Why so serious?', vote_average: 8.5, release_date: '2008-07-18', genre_ids: [28, 80, 18], popularity: 110, media_type: 'movie' },
  { id: 27205, title: 'Inception', poster_path: '/ljsZTbVsrQSqZgWeep2B1QiDKuh.jpg', backdrop_path: '/8ZTVqvKDQ8emSGUEMjsS4yHAwrp.jpg', overview: 'Your mind is the scene of the crime.', vote_average: 8.4, release_date: '2010-07-16', genre_ids: [28, 878, 12], popularity: 105, media_type: 'movie' },
  { id: 157336, title: 'Interstellar', poster_path: '/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg', backdrop_path: '/xJHokMbljXjADYdit5fK1B4FmN.jpg', overview: 'Mankind was born on Earth. It was never meant to die here.', vote_average: 8.4, release_date: '2014-11-05', genre_ids: [878, 18, 12], popularity: 100, media_type: 'movie' },
  { id: 603, title: 'The Matrix', poster_path: '/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg', backdrop_path: '/fNG7i7RqMErkcqhohV2a6cV1Ehy.jpg', overview: 'Welcome to the Real World.', vote_average: 8.2, release_date: '1999-03-31', genre_ids: [28, 878], popularity: 85, media_type: 'movie' },
  { id: 496243, title: 'Parasite', poster_path: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg', backdrop_path: '/TU9NIjwzjoKPwQHoHshkFcQUCG.jpg', overview: 'Act like you own the place.', vote_average: 8.5, release_date: '2019-05-30', genre_ids: [35, 53, 18], popularity: 88, media_type: 'movie' },
  { id: 238, title: 'The Godfather', poster_path: '/3bhkrj58Vtu7enYsRolD1fZdja1.jpg', backdrop_path: '/tmU7GeKVybMWFButWEGl2M4GeiP.jpg', overview: "An offer you can't refuse.", vote_average: 8.7, release_date: '1972-03-14', genre_ids: [18, 80], popularity: 92, media_type: 'movie' },
  { id: 424, title: 'Schindler\'s List', poster_path: '/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg', backdrop_path: '/loRmRzQXZC0MnuMo5q4NKGHIXR.jpg', overview: 'Whoever saves one life, saves the world entire.', vote_average: 8.6, release_date: '1993-12-15', genre_ids: [18, 36, 10752], popularity: 80, media_type: 'movie' },
  { id: 13, title: 'Forrest Gump', poster_path: '/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg', backdrop_path: '/7c9UVPPiTPltouxRVY6N9uugaVA.jpg', overview: 'Life is like a box of chocolates.', vote_average: 8.5, release_date: '1994-06-23', genre_ids: [35, 18, 10749], popularity: 88, media_type: 'movie' },
  { id: 569094, title: 'Spider-Man: Across the Spider-Verse', poster_path: '/8Vt6mWEReuy4Of61Lnj5Xj704m8.jpg', backdrop_path: '/4HodYYKEIsGOdinkGi2Ucz6X9i0.jpg', overview: 'It\'s how you wear the mask that matters.', vote_average: 8.4, release_date: '2023-05-31', genre_ids: [16, 28, 12], popularity: 115, media_type: 'movie' },
  { id: 872585, title: 'Oppenheimer', poster_path: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg', backdrop_path: '/nb3xI8XI3w4pMVZ38VijceceOo6.jpg', overview: 'The world forever changes.', vote_average: 8.1, release_date: '2023-07-19', genre_ids: [18, 36], popularity: 120, media_type: 'movie' },
  { id: 346698, title: 'Barbie', poster_path: '/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg', backdrop_path: '/nHf61UzkfFno5X1ofIhugCPus2R.jpg', overview: 'She\'s everything. He\'s just Ken.', vote_average: 7.0, release_date: '2023-07-19', genre_ids: [35, 14, 12], popularity: 118, media_type: 'movie' },
  { id: 76600, title: 'Avatar: The Way of Water', poster_path: '/t6HIqrRAclMCA60NsSmeqe9RmNV.jpg', backdrop_path: '/s16H6tpK2utvwDtzZ8Qy4qm5Emw.jpg', overview: 'Return to Pandora.', vote_average: 7.6, release_date: '2022-12-14', genre_ids: [878, 28, 12], popularity: 108, media_type: 'movie' },
  { id: 361743, title: 'Top Gun: Maverick', poster_path: '/62HCnUTziyWcpDaBO2i1DG3wn2.jpg', backdrop_path: '/AaV1YIdWKhsXTtjG2IjVKmY6K0c.jpg', overview: 'Feel the need... the need for speed.', vote_average: 8.3, release_date: '2022-05-24', genre_ids: [28, 18], popularity: 102, media_type: 'movie' },
  { id: 545611, title: 'Everything Everywhere All at Once', poster_path: '/w3LxiVYdWWRvEVdn5RYq6jIqkb1.jpg', backdrop_path: '/fAFVWgGbbmhsBYW6clfWRXpGYh.jpg', overview: 'The universe is so much bigger than you realize.', vote_average: 7.8, release_date: '2022-03-24', genre_ids: [28, 12, 878], popularity: 95, media_type: 'movie' },
  { id: 414906, title: 'The Batman', poster_path: '/74xTEgt7R36Fpooo50r9T25onhq.jpg', backdrop_path: '/b0PlSFdDwbyFAJlMe1mDbGSdRSb.jpg', overview: 'Unmask the truth.', vote_average: 7.7, release_date: '2022-03-01', genre_ids: [80, 9648, 53], popularity: 93, media_type: 'movie' },
  { id: 438631, title: 'Dune', poster_path: '/d5NXSklXo0qyIYkgV94XAgMIckC.jpg', backdrop_path: '/jYEW5xZkZk2WTrdbMGAPFuBqbDc.jpg', overview: 'It begins.', vote_average: 7.8, release_date: '2021-09-15', genre_ids: [878, 12], popularity: 98, media_type: 'movie' },
  { id: 603692, title: 'John Wick: Chapter 4', poster_path: '/vZloFAK7NmvMGKE7LsyBGSQlNVr.jpg', backdrop_path: '/7I6VUdPj6tQECNHdviJkUHD2u89.jpg', overview: 'No way back, one way out.', vote_average: 7.7, release_date: '2023-03-22', genre_ids: [28, 53, 80], popularity: 106, media_type: 'movie' },
];
