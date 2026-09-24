export type NotAHotelProfile = {
  key: string;
  title: string;
  area: string;
  shortLabel: string;
  summary: string;
  design: string;
  stay: string;
  dining: string;
  access: string;
  bestFor: string[];
  highlights: string[];
  houseNotes: Record<string, string>;
  officialUrl: string;
  /** 公式サイトのOGP画像（出典明記のうえカード表示に使用）。無い拠点はキーアートにフォールバック */
  imageUrl?: string;
  /** 公式サイト記載の住所。公式に記載がない拠点は載せない（推測で書かない） */
  address?: string;
};

const PROFILES: NotAHotelProfile[] = [
  {
    key: 'aoshima',
    title: 'NOT A HOTEL AOSHIMA',
    area: 'Miyazaki / Aoshima',
    shortLabel: 'Oceanfront beach stay',
    summary: 'A NOT A HOTEL on the coast of Aoshima, Miyazaki, built for living with the horizon. Beach, pool, sauna, and sea air are all close at hand, giving this location a strong sense of tropical openness.',
    design: 'Large windows opening to the sea, poolside terraces, and outdoor living blur the line between indoors and the shore. Houses such as COAST, CHILL, SURF, and GARDEN each sit at a different distance from the water.',
    stay: 'Wake up looking at the sea in the morning, spend the day at the pool or beach, then unwind at the sauna or outdoor living space in the evening. Also suits group stays with family or friends.',
    dining: 'Aoshima combines private dinners, BBQ, and center-kitchen-style dining experiences. A place where the coastal stay and the food are meant to be considered together.',
    access: 'About 15 minutes by car from Miyazaki Bougainvillea Airport. About 95 minutes by air from Haneda to Miyazaki Airport as a guide.',
    bestFor: ['Spending time looking at the sea', 'Sauna and pool focus', 'Stays with family or friends', 'Tropical openness'],
    highlights: ['Views of the Pacific', 'Private pool', 'Private sauna', 'Steps from the beach', 'BBQ and beachside dining'],
    houseNotes: {
      coast: 'COAST is a beach house with a pool and courtyard. Its closeness to the beach and 2-bedroom layout make it easy to enjoy with family or friends.',
      chill: 'CHILL / CHILL 2.0 is an open house built around the horizon — suited to those who want to prioritize the view, the pool, and sauna time.',
      surf: 'SURF suits those who want a light, easy stay close to the sea.',
      garden: 'GARDEN suits a calmer stay with a garden buffer along the shore.',
      masterpiece: 'MASTERPIECE suits those looking for a stay with real scale, even by Aoshima standards.',
    },
    officialUrl: 'https://notahotel.com/shop/aoshima',
    imageUrl: 'https://imagedelivery.net/jZ4zarr81i7OIuT1JQY5_A/lp/place/aoshima/2400x1600/hero1_h.png/public',
    address: '〒889-2162 宮崎県宮崎市青島2丁目241-1',
  },
  {
    key: 'kitakaruizawa',
    title: 'NOT A HOTEL KITAKARUIZAWA',
    area: 'Gunma / Kitakaruizawa',
    shortLabel: 'Forest, onsen and mountain air',
    summary: 'A NOT A HOTEL opening onto the forest at the northern foot of Mt. Asama, built for nature, onsen, sauna, and time by the fire. A place to step away from the city and into quiet highland air.',
    design: 'Architecture combining glass, wood, stone, fire, and hot spring to draw the forest close. Houses such as IRORI, MASU, BASE, and NATURE WITHIN each offer a different experience of hearth, roofline, rock, and terrace.',
    stay: 'Spend the day among the forest and the nature around Mt. Asama, then the evening around a fire in the living room, at the onsen, or in the sauna. Suits both long family stays and quiet retreat.',
    dining: 'Kitakaruizawa leans heavily on hearth-cooked meals and cafe/dining tied to the forest — a place to prioritize a dining experience that completes itself within the property.',
    access: 'About 35 minutes by car from Karuizawa Station. About 3 hours by car from Tokyo, or about 1 hour by helicopter, as a guide.',
    bestFor: ['Retreating into the forest', 'Onsen and sauna focus', 'Family stays', 'Time around the fire', 'Winter highlands'],
    highlights: ['Natural hot spring', 'Private sauna', 'Hearth / fireplace', 'Forest views', 'Mt. Asama area'],
    houseNotes: {
      irori: 'IRORI is a house defined by its hearth and the way it opens to the forest. IRORI 2.0 adds a pool and stronger family comfort.',
      'nature within': 'NATURE WITHIN is defined by a vast space held between a great roof and rock — suited to those who want to feel the scale of the architecture.',
      masu: 'MASU leans into a context of architecture for the modern aesthete, and suits a stay built around quiet taste.',
      base: 'BASE, a triangular-roofed house, suits a stay built around choosing between rooms of different sizes.',
    },
    officialUrl: 'https://notahotel.com/shop/kitakaruizawa',
    imageUrl: 'https://imagedelivery.net/jZ4zarr81i7OIuT1JQY5_A/lp/place/kitakaruizawa/kids-park/1440x862/hero-pc.jpg/public',
    address: '群馬県吾妻郡嬬恋村大前字細原2286-340他',
  },
  {
    key: 'nasu',
    title: 'NOT A HOTEL NASU',
    area: 'Tochigi / Nasu',
    shortLabel: 'Farm view, hot spring and sauna',
    summary: 'A highland NOT A HOTEL borrowing the vast pastureland of Nasu as its backdrop. Farm views, a natural hot spring, sauna, and pool combine for a stay that resets both the eye and the body.',
    design: 'MASTERPIECE, CAVE, and THINK each carry a distinct character — a floating feel, a cave-like quality, a house for reading. Bold architecture set within nature creates time unlike the everyday.',
    stay: 'A stay spent slowly with the pastureland view, the night sky, the onsen, the sauna, and the pool. Some houses accommodate larger groups, suiting stays with family or friends.',
    dining: 'Chef-prepared meals and dining with a panoramic view of nature suit this place well. Staying on-site rather than venturing out feels like the natural rhythm here.',
    access: 'About 22 minutes by car from Nasu-Shiobara Station. About 90 minutes from Tokyo Station by shinkansen and car, as a guide.',
    bestFor: ['Highland scenery', 'Onsen and sauna', 'Larger-group stays', 'Quiet, restorative time'],
    highlights: ['Sweeping pastureland views', 'Natural hot spring', 'Private sauna', 'Private pool', 'Starry skies'],
    houseNotes: {
      masterpiece: 'MASTERPIECE is a house with a floating quality that merges with Nasu\'s nature. Also suits larger-group stays.',
      cave: 'CAVE is calm, cave-like architecture — suited to those who want to prioritize the view and time for reflection.',
      think: 'THINK, with a main house and an annex, has a study and a corridor of bookshelves — suited to a reading-oriented stay.',
    },
    officialUrl: 'https://notahotel.com/shop/nasu',
    imageUrl: 'https://imagedelivery.net/jZ4zarr81i7OIuT1JQY5_A/lp/place/nasu/2400x1600/mg-2518.jpg/public',
    address: '〒324-0401 栃木県大田原市狭原1291-7',
  },
  {
    key: 'fukuoka',
    title: 'NOT A HOTEL FUKUOKA',
    area: 'Fukuoka / Yakuin',
    shortLabel: 'Urban base with room to live',
    summary: 'An urban-stay NOT A HOTEL in Yakuin, Fukuoka. Close to the airport and Tenjin, making it easy to combine work, food, walking the city, and a stay that feels like living there.',
    design: 'Urban form combined with greenery, in rooms with over 100㎡ of room to spare. PENTHOUSE, BAR, CHEF, and DESK each carry a different theme for how to spend your time.',
    stay: 'Out in the city by day, unwinding in the room by night. Suits those who want to play in Fukuoka, a city of food, while keeping room to return to the hotel.',
    dining: 'Pairs well with the local restaurants around Yakuin and Hirao. Enjoy eating out while also using the room’s kitchen or bar-like setup.',
    access: 'About 17 minutes by car from Fukuoka Airport. About a 10-minute walk from Yakuin Station, or about 6 minutes from Hirao Station, as a guide.',
    bestFor: ['Urban stay', 'Fukuoka’s food scene', 'Balancing work and play', 'Short trips'],
    highlights: ['Close to the airport', 'Yakuin area', 'Rooms over 100㎡', 'Rooms with sauna or terrace', 'Easy to walk the city'],
    houseNotes: {
      penthouse: 'PENTHOUSE suits an urban stay that prioritizes the rooftop and sense of space.',
      bar: 'BAR suits those who want to prioritize drinking in the room and the afterglow of the night.',
      chef: 'CHEF is easy to build a food-centered stay around.',
      desk: 'DESK suits those who want to blend work with their stay.',
      doma: 'DOMA suits those who want a stay that feels close to everyday city life.',
    },
    officialUrl: 'https://notahotel.com/shop/fukuoka',
    imageUrl: 'https://imagedelivery.net/jZ4zarr81i7OIuT1JQY5_A/lp/place/fukuoka/2400x1600/275.jpg/public',
    address: '福岡県福岡市中央区大宮2丁目3-34',
  },
  {
    key: 'setouchi',
    title: 'NOT A HOTEL SETOUCHI',
    area: 'Hiroshima / Sagi Island',
    shortLabel: 'Art islands and quiet sea',
    summary: 'A NOT A HOTEL set on a peninsula of Sagi Island, floating in the Seto Inland Sea. A stay where quiet sea, island scenery, and a context of art and architecture overlap.',
    design: 'A villa-style stay experienced as one long continuous space, making the most of the Seto Inland Sea’s calm water and the peninsula’s terrain. The time spent simply looking at the sea becomes the main event.',
    stay: 'Rather than packing in activities, a stay spent long with the island’s quiet and the sea. Pairs well with Setouchi’s art, architecture, and island-hopping to deepen the experience.',
    dining: 'Imagine enjoying Setouchi seafood and island food alongside sea views. Planning the food during your stay matters more here than eating out.',
    access: 'The Sagi Island area of Mihara City, Hiroshima. Since travel includes a boat crossing, plan your transit more carefully than for a typical city hotel.',
    bestFor: ['Quiet sea', 'Art and architecture', 'Island-hopping', 'Longer stays'],
    highlights: ['The Seto Inland Sea', 'Sagi Island', 'A peninsula-like sense of privacy', 'Villas overlooking the sea', 'An art / architecture context'],
    houseNotes: {
      '360': '360 suits a stay that prioritizes the scale of taking in the wide Seto Inland Sea.',
      '270': '270 suits a stay built around enjoying the distance to the sea and the breadth of the view.',
      '180': '180 suits those who want a calmer time by the water.',
    },
    officialUrl: 'https://notahotel.com/properties/setouchi',
    imageUrl: 'https://notahotel.com/assets/images/ogp/shop/setouchi_ogp.v3.png',
  },
  {
    key: 'minakami',
    title: 'NOT A HOTEL MINAKAMI',
    area: 'Gunma / Minakami',
    shortLabel: 'Mountain, river and retreat',
    summary: 'A mountain NOT A HOTEL set against the nature of Minakami, Gunma. River, forest, and mountain are all close by, suiting both active stays and quiet rest.',
    design: 'A layout connecting mountain views with a quiet interior — suited to a stay that moves between nature’s rawness and indoor calm.',
    stay: 'Combines activities like rafting, snow, and hiking with quiet rest in the room. A place to enjoy the character of each season.',
    dining: 'Mountain ingredients, warm cooking, and meals after activities suit this place well — food that restores the body in nature, rather than city-style dining out.',
    access: 'Plan the Minakami area around car travel. Confirm official information, as travel conditions change with weather and season.',
    bestFor: ['Mountain nature', 'Activities', 'Snow scenery', 'Quiet rest'],
    highlights: ['Mountain and river', 'Seasonal nature', 'Active stays', 'A quiet retreat'],
    houseNotes: {},
    officialUrl: 'https://notahotel.com/shop/minakami',
  },
  {
    key: 'miura',
    title: 'NOT A HOTEL MIURA',
    area: 'Kanagawa / Miura',
    shortLabel: 'Ocean view close to Tokyo',
    summary: 'A NOT A HOTEL on the shore of Miura, relatively close to central Tokyo. A weekend ocean-view base that takes in a wide sweep of sky and sea.',
    design: 'Centered on villa and club-style stays that open toward the sea — a short distance from Tokyo, but a switch to an extraordinary view.',
    stay: 'Easy to escape to the coast even on a short trip. Suits anniversaries, weekends, and small-group stays.',
    dining: 'Pairs well with Miura’s seafood and coastal dining — a place to combine time at the hotel with the food of the surrounding sea.',
    access: 'A coastal base easy to reach by car from the greater Tokyo area — pairs well with weekend use.',
    bestFor: ['Sea close to Tokyo', 'Weekend stays', 'Ocean views', 'Anniversaries'],
    highlights: ['Ocean views', 'Close to central Tokyo', 'Villa stays', 'A club / pool context'],
    houseNotes: {
      'club villa': 'CLUB VILLA suits those who want to prioritize openness, as an ocean-view villa connecting sky and sea.',
      'club suite': 'CLUB SUITE, as a pool-club base, is easy to use even for a short trip.',
    },
    officialUrl: 'https://notahotel.com/shop/miura',
    imageUrl: 'https://notahotel.com/assets/images/ogp/properties/miura-pool-club.jpg',
  },
  {
    key: 'tokyo',
    title: 'NOT A HOTEL TOKYO',
    area: 'Tokyo',
    shortLabel: 'Creative urban residence',
    summary: 'An urban NOT A HOTEL that embodies NIGO’s vision. Not a resort — a base for an extraordinary residential experience within Tokyo itself.',
    design: 'Urban architecture with a strong personal aesthetic and collector’s sensibility. A stay built around immersion in a world view, rather than opening onto nature.',
    stay: 'Suited to a Tokyo stay you want to spend as a residence rather than a hotel — for those who prioritize a creative context.',
    dining: 'Pairs naturally with restaurants, bars, and galleries around the city — moving back and forth between Tokyo outside and the room’s own world view.',
    access: 'The Tokyo area. Check official information for details.',
    bestFor: ['A Tokyo stay', 'Design / culture', 'A route through restaurants', 'An extraordinary urban experience'],
    highlights: ['NIGO’s vision', 'Urban stay', 'A cultural context', 'Pairs well with Tokyo dining'],
    houseNotes: {
      nigo: 'THE NIGO HOUSE is a one-of-a-kind building that embodies NIGO’s vision — suited to those with a strong interest in culture and design.',
    },
    officialUrl: 'https://notahotel.com/shop/tokyo',
    imageUrl: 'https://notahotel.com/assets/images/ogp/shop/tokyo_ogp.jpg',
  },
  {
    key: 'ishigaki',
    title: 'NOT A HOTEL ISHIGAKI',
    area: 'Okinawa / Ishigaki',
    shortLabel: 'Island resort in Okinawa',
    summary: 'A NOT A HOTEL set against the nature and sea of Ishigaki Island. A base to plan around tropical air, island time, and ocean activities.',
    design: 'A resort-style stay open to Okinawa’s light, wind, and sea. Plan it as an island trip, confirming details with official information.',
    stay: 'Suited to the sea, starry skies, island food, and a longer break — a place to enjoy the travel itself, transit included.',
    dining: 'Pairs well with Okinawan and Ishigaki ingredients and island eateries — combine time at the hotel with island food.',
    access: 'The Ishigaki Island area. Plan around air travel.',
    bestFor: ['Island travel', 'A longer break', 'The sea', 'A tropical resort'],
    highlights: ['Ishigaki Island', 'The sea', 'Island time', 'A resort stay'],
    houseNotes: {},
    officialUrl: 'https://notahotel.com/shop/ishigaki',
  },
  {
    key: 'rusutsu',
    title: 'NOT A HOTEL RUSUTSU',
    area: 'Hokkaido / Rusutsu',
    shortLabel: 'Mountain resort in Hokkaido',
    summary: 'A NOT A HOTEL planned within the mountain resort of Rusutsu, Hokkaido. A base well suited to snow, mountains, and resort activities.',
    design: 'Centered on a stay that takes in Hokkaido’s vast nature, in the context of architecture standing at a mountain summit.',
    stay: 'Suits the winter snow season, the summer highland resort, and longer stays with family or a group.',
    dining: 'Pairs easily with Hokkaido ingredients and dining both in and around the resort — food after activities matters here.',
    access: 'The Rusutsu area of Hokkaido. Confirm official information, as travel plans change by season.',
    bestFor: ['A snow resort', 'Hokkaido', 'Family stays', 'Mountain nature'],
    highlights: ['Rusutsu Resort', 'Mountain views', 'The snow season', 'Hokkaido food'],
    houseNotes: {
      rusutsu: 'RUSUTSU, standing at the summit of Rusutsu Resort, suits those who want to prioritize a stay of mountains and snow.',
    },
    officialUrl: 'https://notahotel.com/shop/rusutsu',
    imageUrl: 'https://imagedelivery.net/jZ4zarr81i7OIuT1JQY5_A/lp/place/rusutsu/2400x1600/rusutsu-summit-powder.jpg/public',
  },
];

const KEY_ALIASES: Record<string, string[]> = {
  aoshima: ['aoshima', '青島', '宮崎', 'miyazaki', 'coast', 'chill', 'surf', 'garden'],
  kitakaruizawa: ['kitakaruizawa', 'kita karuizawa', '北軽井沢', '軽井沢', 'irori', 'masu', 'base', 'nature within'],
  nasu: ['nasu', '那須', 'masterpiece', 'cave', 'think'],
  fukuoka: ['fukuoka', '福岡', '薬院', 'yakuin', 'penthouse', 'sound', 'bar', 'retreat', 'atelier', 'chef', 'desk', 'doma'],
  setouchi: ['setouchi', '瀬戸内', 'sagi', '佐木島', '360', '270', '180'],
  minakami: ['minakami', '水上', 'みなかみ'],
  miura: ['miura', '三浦', 'club villa', 'club suite'],
  tokyo: ['tokyo', '東京', 'nigo'],
  ishigaki: ['ishigaki', '石垣'],
  rusutsu: ['rusutsu', 'ルスツ', '北海道', 'hokkaido'],
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').trim();
}

/** LINEUP表示用: 全拠点プロファイルを別名（マッチング用）付きで返す */
export function listNotAHotelProfiles(): Array<NotAHotelProfile & { aliases: string[] }> {
  return PROFILES.map((p) => ({ ...p, aliases: KEY_ALIASES[p.key] ?? [p.key] }));
}

export function getNotAHotelProfile(input: {
  house?: string | null;
  place?: string | null;
  prefecture?: string | null;
  name?: string | null;
}): NotAHotelProfile | null {
  const haystack = normalize([input.house, input.place, input.prefecture, input.name].filter(Boolean).join(' '));
  if (!haystack) return null;

  for (const profile of PROFILES) {
    const aliases = KEY_ALIASES[profile.key] ?? [profile.key];
    if (aliases.some((alias) => haystack.includes(normalize(alias)))) return profile;
  }
  return null;
}

export function getHouseNote(profile: NotAHotelProfile | null, house?: string | null): string | null {
  if (!profile || !house) return null;
  const normalizedHouse = normalize(house);
  for (const [key, note] of Object.entries(profile.houseNotes)) {
    if (normalizedHouse.includes(normalize(key))) return note;
  }
  return null;
}
