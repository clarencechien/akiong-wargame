import geoJson from '../../data/geography.json';

export interface Beach {
  id: string;
  name: string;
  coast: 'west' | 'east';
  region: 'north' | 'central' | 'south' | 'east';
  lonlat: [number, number];
  defBrigades: number;
  supplyable: boolean;
  note?: string;
}

export interface Region {
  name: string;
  command?: string;
  note?: string;
  regularBrigades: number;
  reserveBrigades: number;
  distanceToCapitalKm: number;
  beaches: string[];
}

export interface Geography {
  beaches: Beach[];
  regions: Record<'north' | 'central' | 'south' | 'east', Region>;
  ports: { id: string; name: string; lonlat: [number, number] }[];
  penghu: { lonlat: [number, number]; defBrigades: number; liftCost: number; defenderWarningDays: number };
  eastFeint: { liftCost: number; pinsBrigades: number };
  map: { lon: [number, number]; lat: [number, number] };
}

export const GEO: Geography = geoJson as unknown as Geography;

export function beachesOf(region: Beach['region']): Beach[] {
  return GEO.beaches.filter((b) => b.region === region);
}

export function portFor(region: Beach['region']): { id: string; name: string; lonlat: [number, number] } {
  const id = region === 'north' ? 'pingtan' : region === 'south' ? 'shantou' : 'xiamen';
  const p = GEO.ports.find((x) => x.id === id);
  if (!p) throw new Error(`港口不存在：${id}`);
  return p;
}
